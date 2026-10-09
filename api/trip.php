<?php

require_once 'db.php';
require_once 'analytics_helper.php';

header('Content-Type: application/json; charset=utf-8');

function response($statusCode, $success, $message, $data = [])
{
    http_response_code($statusCode);

    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data
    ], JSON_UNESCAPED_UNICODE);

    exit;
}

function getInput()
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!is_array($input)) {
        $input = $_POST;
    }

    return $input;
}

function getToken($input)
{
    return trim($input['token'] ?? '');
}

function authUser($pdo, $input)
{
    $token = getToken($input);

    if (!$token) {
        response(401, false, 'Token göndərilməyib');
    }

    $tokenHash = hash('sha256', $token);

    $stmt = $pdo->prepare("
        SELECT
            u.id,
            u.full_name,
            u.phone,
            u.status,
            u.deleted_at,
            t.expires_at,
            t.revoked_at
        FROM user_tokens t
        INNER JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = :token_hash
        LIMIT 1
    ");

    $stmt->execute([
        ':token_hash' => $tokenHash
    ]);

    $user = $stmt->fetch();

    if (!$user) {
        response(401, false, 'Token yanlışdır');
    }

    if ($user['revoked_at'] !== null) {
        response(401, false, 'Token deaktiv edilib');
    }

    if (strtotime($user['expires_at']) < time()) {
        response(401, false, 'Tokenin vaxtı bitib');
    }

    if ($user['deleted_at'] !== null || $user['status'] !== 'active') {
        response(403, false, 'Hesab aktiv deyil');
    }

    return $user;
}

function checkStationExists($pdo, $stationId, $message)
{
    $stmt = $pdo->prepare("
        SELECT id, name, line_name
        FROM stations
        WHERE id = :id
          AND is_active = 1
        LIMIT 1
    ");

    $stmt->execute([
        ':id' => $stationId
    ]);

    $station = $stmt->fetch();

    if (!$station) {
        response(404, false, $message);
    }

    return $station;
}

function prepareRouteSnapshot($routeSnapshot)
{
    if ($routeSnapshot === null || $routeSnapshot === '') {
        return null;
    }

    if (is_array($routeSnapshot)) {
        return json_encode($routeSnapshot, JSON_UNESCAPED_UNICODE);
    }

    if (is_string($routeSnapshot)) {
        json_decode($routeSnapshot, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            response(400, false, 'route_snapshot düzgün JSON formatında deyil');
        }

        return $routeSnapshot;
    }

    response(400, false, 'route_snapshot array və ya JSON string olmalıdır');
}

function formatTrip($trip)
{
    return [
        'id' => (int) $trip['id'],
        'user_id' => (int) $trip['user_id'],
        'from_station_id' => (int) $trip['from_station_id'],
        'to_station_id' => (int) $trip['to_station_id'],
        'current_station_id' => $trip['current_station_id'] !== null ? (int) $trip['current_station_id'] : null,
        'active_step_order' => (int) $trip['active_step_order'],
        'status' => $trip['status'],
        'route_snapshot' => $trip['route_snapshot'] ? json_decode($trip['route_snapshot'], true) : null,
        'started_at' => $trip['started_at'],
        'updated_at' => $trip['updated_at'],
        'completed_at' => $trip['completed_at'],
        'cancelled_at' => $trip['cancelled_at']
    ];
}

function getActiveTrip($pdo, $userId)
{
    $stmt = $pdo->prepare("
        SELECT *
        FROM user_trip_sessions
        WHERE user_id = :user_id
          AND status = 'active'
        ORDER BY id DESC
        LIMIT 1
    ");

    $stmt->execute([
        ':user_id' => $userId
    ]);

    return $stmt->fetch();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response(405, false, 'Bu endpoint yalnız POST metodu qəbul edir');
}

$input = getInput();

$action = trim($input['action'] ?? '');

if ($action === '') {
    response(400, false, 'Action göndərilməlidir');
}

$allowedActions = [
    'start_trip',
    'get_active_trip',
    'update_step',
    'complete_trip',
    'cancel_trip'
];

if (!in_array($action, $allowedActions, true)) {
    response(400, false, 'Action düzgün deyil');
}

try {
    $pdo = db();
    $user = authUser($pdo, $input);

    if ($action === 'start_trip') {
        $fromStationId = (int) ($input['from_station_id'] ?? 0);
        $toStationId = (int) ($input['to_station_id'] ?? 0);
        $routeSnapshot = $input['route_snapshot'] ?? null;

        if ($fromStationId <= 0) {
            response(400, false, 'Başlanğıc stansiya düzgün göndərilməyib');
        }

        if ($toStationId <= 0) {
            response(400, false, 'Gediləcək stansiya düzgün göndərilməyib');
        }

        if ($fromStationId === $toStationId) {
            response(400, false, 'Başlanğıc və gediləcək stansiya eyni ola bilməz');
        }

        $fromStation = checkStationExists($pdo, $fromStationId, 'Başlanğıc stansiya tapılmadı');
        $toStation = checkStationExists($pdo, $toStationId, 'Gediləcək stansiya tapılmadı');

        $routeSnapshotJson = prepareRouteSnapshot($routeSnapshot);

        $pdo->beginTransaction();

        $cancelOldTripsStmt = $pdo->prepare("
            UPDATE user_trip_sessions
            SET 
                status = 'cancelled',
                cancelled_at = NOW(),
                updated_at = NOW()
            WHERE user_id = :user_id
              AND status = 'active'
        ");

        $cancelOldTripsStmt->execute([
            ':user_id' => $user['id']
        ]);

        $insertStmt = $pdo->prepare("
            INSERT INTO user_trip_sessions (
                user_id,
                from_station_id,
                to_station_id,
                current_station_id,
                active_step_order,
                status,
                route_snapshot,
                started_at,
                updated_at
            ) VALUES (
                :user_id,
                :from_station_id,
                :to_station_id,
                :current_station_id,
                1,
                'active',
                :route_snapshot,
                NOW(),
                NOW()
            )
        ");

        $insertStmt->execute([
            ':user_id' => $user['id'],
            ':from_station_id' => $fromStationId,
            ':to_station_id' => $toStationId,
            ':current_station_id' => $fromStationId,
            ':route_snapshot' => $routeSnapshotJson
        ]);

        $tripId = $pdo->lastInsertId();

        logAnalyticsEvent(
            $pdo,
            $user['id'],
            'trip_started',
            null,
            $fromStationId,
            $toStationId,
            $tripId,
            [
                'from_station_name' => $fromStation['name'],
                'to_station_name' => $toStation['name'],
                'active_step_order' => 1,
                'has_route_snapshot' => $routeSnapshotJson ? true : false
            ]
        );

        $selectStmt = $pdo->prepare("
            SELECT *
            FROM user_trip_sessions
            WHERE id = :id
              AND user_id = :user_id
            LIMIT 1
        ");

        $selectStmt->execute([
            ':id' => $tripId,
            ':user_id' => $user['id']
        ]);

        $trip = $selectStmt->fetch();

        $pdo->commit();

        response(201, true, 'Səfər uğurla başladıldı', [
            'trip' => formatTrip($trip)
        ]);
    }

    if ($action === 'get_active_trip') {
        $trip = getActiveTrip($pdo, $user['id']);

        if (!$trip) {
            response(200, true, 'Aktiv səfər yoxdur', [
                'has_active_trip' => false,
                'trip' => null
            ]);
        }

        response(200, true, 'Aktiv səfər uğurla gətirildi', [
            'has_active_trip' => true,
            'trip' => formatTrip($trip)
        ]);
    }

    if ($action === 'update_step') {
        $activeStepOrder = (int) ($input['active_step_order'] ?? 0);
        $currentStationId = isset($input['current_station_id']) ? (int) $input['current_station_id'] : null;

        if ($activeStepOrder <= 0) {
            response(400, false, 'Aktiv addım düzgün göndərilməyib');
        }

        if ($currentStationId !== null && $currentStationId <= 0) {
            response(400, false, 'Cari stansiya düzgün göndərilməyib');
        }

        $currentStation = null;

        if ($currentStationId !== null) {
            $currentStation = checkStationExists($pdo, $currentStationId, 'Cari stansiya tapılmadı');
        }

        $trip = getActiveTrip($pdo, $user['id']);

        if (!$trip) {
            response(404, false, 'Aktiv səfər tapılmadı');
        }

        $pdo->beginTransaction();

        $updateStmt = $pdo->prepare("
            UPDATE user_trip_sessions
            SET
                active_step_order = :active_step_order,
                current_station_id = :current_station_id,
                updated_at = NOW()
            WHERE id = :id
              AND user_id = :user_id
              AND status = 'active'
        ");

        $updateStmt->execute([
            ':active_step_order' => $activeStepOrder,
            ':current_station_id' => $currentStationId,
            ':id' => $trip['id'],
            ':user_id' => $user['id']
        ]);

        logAnalyticsEvent(
            $pdo,
            $user['id'],
            'trip_step_updated',
            $currentStationId,
            $trip['from_station_id'],
            $trip['to_station_id'],
            $trip['id'],
            [
                'active_step_order' => $activeStepOrder,
                'current_station_id' => $currentStationId,
                'current_station_name' => $currentStation ? $currentStation['name'] : null
            ]
        );

        $selectStmt = $pdo->prepare("
            SELECT *
            FROM user_trip_sessions
            WHERE id = :id
              AND user_id = :user_id
            LIMIT 1
        ");

        $selectStmt->execute([
            ':id' => $trip['id'],
            ':user_id' => $user['id']
        ]);

        $updatedTrip = $selectStmt->fetch();

        $pdo->commit();

        response(200, true, 'Səfər addımı yeniləndi', [
            'trip' => formatTrip($updatedTrip)
        ]);
    }

    if ($action === 'complete_trip') {
        $trip = getActiveTrip($pdo, $user['id']);

        if (!$trip) {
            response(404, false, 'Aktiv səfər tapılmadı');
        }

        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            UPDATE user_trip_sessions
            SET
                status = 'completed',
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
              AND user_id = :user_id
              AND status = 'active'
        ");

        $stmt->execute([
            ':id' => $trip['id'],
            ':user_id' => $user['id']
        ]);

        logAnalyticsEvent(
            $pdo,
            $user['id'],
            'trip_completed',
            $trip['current_station_id'],
            $trip['from_station_id'],
            $trip['to_station_id'],
            $trip['id'],
            [
                'active_step_order' => (int) $trip['active_step_order'],
                'completed' => true
            ]
        );

        $pdo->commit();

        response(200, true, 'Səfər tamamlandı', [
            'trip_id' => (int) $trip['id']
        ]);
    }

    if ($action === 'cancel_trip') {
        $trip = getActiveTrip($pdo, $user['id']);

        if (!$trip) {
            response(404, false, 'Aktiv səfər tapılmadı');
        }

        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            UPDATE user_trip_sessions
            SET
                status = 'cancelled',
                cancelled_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
              AND user_id = :user_id
              AND status = 'active'
        ");

        $stmt->execute([
            ':id' => $trip['id'],
            ':user_id' => $user['id']
        ]);

        logAnalyticsEvent(
            $pdo,
            $user['id'],
            'trip_cancelled',
            $trip['current_station_id'],
            $trip['from_station_id'],
            $trip['to_station_id'],
            $trip['id'],
            [
                'active_step_order' => (int) $trip['active_step_order'],
                'cancelled' => true
            ]
        );

        $pdo->commit();

        response(200, true, 'Səfər ləğv edildi', [
            'trip_id' => (int) $trip['id']
        ]);
    }

} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    response(500, false, 'Server xətası baş verdi', [
        'error' => $e->getMessage()
    ]);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    response(500, false, 'Gözlənilməz xəta baş verdi', [
        'error' => $e->getMessage()
    ]);
}