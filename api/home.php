<?php

require_once 'db.php';

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

function formatTrip($trip)
{
    if (!$trip) {
        return null;
    }

    return [
        'id' => (int) $trip['id'],
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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response(405, false, 'Bu endpoint yalnız POST metodu qəbul edir');
}

$input = getInput();

try {
    $pdo = db();

    $user = authUser($pdo, $input);

    $stationStmt = $pdo->prepare("
        SELECT
            s.id,
            s.name,
            s.line_name,
            c.crowd_level,
            c.crowd_text,
            c.updated_at
        FROM stations s
        LEFT JOIN station_crowd_status c ON c.station_id = s.id
        WHERE s.is_active = 1
        ORDER BY s.id ASC
        LIMIT 1
    ");

    $stationStmt->execute();

    $station = $stationStmt->fetch();

    if (!$station) {
        response(404, false, 'Aktiv stansiya tapılmadı');
    }

    $activeTripStmt = $pdo->prepare("
        SELECT *
        FROM user_trip_sessions
        WHERE user_id = :user_id
          AND status = 'active'
        ORDER BY id DESC
        LIMIT 1
    ");

    $activeTripStmt->execute([
        ':user_id' => $user['id']
    ]);

    $activeTrip = $activeTripStmt->fetch();

    response(200, true, 'Ana səhifə məlumatları uğurla gətirildi', [
        'user' => [
            'id' => (int) $user['id'],
            'full_name' => $user['full_name'],
            'phone' => $user['phone']
        ],
        'current_crowd' => [
            'station_id' => (int) $station['id'],
            'station_name' => $station['name'],
            'line_name' => $station['line_name'],
            'crowd_level' => $station['crowd_level'] ?? 'low',
            'crowd_text' => $station['crowd_text'] ?? 'Aşağı',
            'updated_at' => $station['updated_at']
        ],
        'optimal_route' => null,
        'route_config' => [
            'from_station_id' => (int) $station['id'],
            'message' => 'Marşrut hesablamaq üçün gediləcək stansiya seçilməlidir'
        ],
        'live_tracking' => [
            'enabled' => true,
            'station_id' => (int) $station['id'],
            'button_text' => 'Canlı izləməyə bax'
        ],
        'active_trip' => [
            'has_active_trip' => $activeTrip ? true : false,
            'trip' => $activeTrip ? formatTrip($activeTrip) : null
        ]
    ]);

} catch (PDOException $e) {
    response(500, false, 'Server xətası baş verdi', [
        'error' => $e->getMessage()
    ]);
} catch (Exception $e) {
    response(500, false, 'Gözlənilməz xəta baş verdi', [
        'error' => $e->getMessage()
    ]);
}