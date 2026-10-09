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

function formatCrowdAlert($alert)
{
    if (!$alert) {
        return [
            'show' => false
        ];
    }

    return [
        'show' => true,
        'id' => (int) $alert['id'],
        'type' => $alert['alert_type'],
        'severity' => $alert['severity'],
        'title' => $alert['title'],
        'message' => $alert['message'],
        'description' => $alert['description'],
        'expected_in_minutes' => $alert['expected_in_minutes'] !== null ? (int) $alert['expected_in_minutes'] : null,
        'primary_action' => [
            'text' => $alert['primary_action_text'],
            'action' => $alert['primary_action_key']
        ],
        'secondary_action' => [
            'text' => $alert['secondary_action_text'],
            'action' => $alert['secondary_action_key']
        ],
        'starts_at' => $alert['starts_at'],
        'ends_at' => $alert['ends_at']
    ];
}

function formatAlternativeSuggestion($alternative)
{
    if (!$alternative) {
        return [
            'available' => false
        ];
    }

    return [
        'available' => true,
        'type' => 'next_train',
        'title' => $alternative['title'],
        'message' => $alternative['message'],
        'current_train_min' => (int) $alternative['current_train_min'],
        'alternative_train_min' => (int) $alternative['alternative_train_min'],
        'current_crowd_level' => $alternative['current_crowd_level'],
        'current_crowd_text' => $alternative['current_crowd_text'],
        'alternative_crowd_level' => $alternative['alternative_crowd_level'],
        'alternative_crowd_text' => $alternative['alternative_crowd_text'],
        'recommended_wagon' => $alternative['recommended_wagon'] !== null ? (int) $alternative['recommended_wagon'] : null,
        'updated_at' => $alternative['updated_at']
    ];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response(405, false, 'Bu endpoint yalnız POST metodu qəbul edir');
}

$input = getInput();

$stationId = (int) ($input['station_id'] ?? 0);
$trainNumber = trim($input['train_number'] ?? 'T-001');

if ($stationId <= 0) {
    response(400, false, 'Stansiya ID düzgün deyil');
}

if ($trainNumber === '') {
    response(400, false, 'Qatar nömrəsi düzgün deyil');
}

try {
    $pdo = db();

    $user = authUser($pdo, $input);

    $stationStmt = $pdo->prepare("
        SELECT
            id,
            name,
            line_name
        FROM stations
        WHERE id = :id
          AND is_active = 1
        LIMIT 1
    ");

    $stationStmt->execute([
        ':id' => $stationId
    ]);

    $station = $stationStmt->fetch();

    if (!$station) {
        response(404, false, 'Stansiya tapılmadı');
    }

    $liveStmt = $pdo->prepare("
        SELECT
            train_status,
            next_train_min,
            hint_title,
            hint_text,
            updated_at
        FROM station_live_status
        WHERE station_id = :station_id
        LIMIT 1
    ");

    $liveStmt->execute([
        ':station_id' => $stationId
    ]);

    $live = $liveStmt->fetch();

    if (!$live) {
        response(404, false, 'Bu stansiya üçün canlı məlumat tapılmadı');
    }

    $wagonStmt = $pdo->prepare("
        SELECT
            wagon_number,
            occupancy_level,
            occupancy_text,
            is_recommended,
            updated_at
        FROM station_wagon_status
        WHERE station_id = :station_id
        ORDER BY wagon_number ASC
    ");

    $wagonStmt->execute([
        ':station_id' => $stationId
    ]);

    $wagons = $wagonStmt->fetchAll();

    if (!$wagons) {
        response(404, false, 'Bu stansiya üçün vaqon məlumatı tapılmadı');
    }

    $countStmt = $pdo->prepare("
        SELECT
            wagon_number,
            wagon_capacity,
            current_people_count,
            updated_at
        FROM train_wagon_counts
        WHERE train_number = :train_number
        ORDER BY wagon_number ASC
    ");

    $countStmt->execute([
        ':train_number' => $trainNumber
    ]);

    $countRows = $countStmt->fetchAll();
    $wagonCounts = [];
    $trainWagonStats = [];

    foreach ($countRows as $countRow) {
        $wagonNumber = (int) $countRow['wagon_number'];
        $capacity = (int) $countRow['wagon_capacity'];
        $peopleCount = (int) $countRow['current_people_count'];

        $stats = [
            'train_number' => $trainNumber,
            'wagon_number' => $wagonNumber,
            'wagon_capacity' => $capacity,
            'current_people_count' => $peopleCount,
            'available_space' => max(0, $capacity - $peopleCount),
            'occupancy_percent' => $capacity > 0
                ? round(($peopleCount / $capacity) * 100, 2)
                : 0,
            'stats_updated_at' => $countRow['updated_at']
        ];

        $wagonCounts[$wagonNumber] = $stats;
        $trainWagonStats[] = $stats;
    }

    $formattedWagons = [];
    $recommendedWagon = null;

    foreach ($wagons as $wagon) {
        $wagonNumber = (int) $wagon['wagon_number'];
        $countStats = $wagonCounts[$wagonNumber] ?? [
            'train_number' => $trainNumber,
            'wagon_capacity' => null,
            'current_people_count' => null,
            'available_space' => null,
            'occupancy_percent' => null,
            'stats_updated_at' => null
        ];

        $item = [
            'wagon_number' => $wagonNumber,
            'occupancy_level' => $wagon['occupancy_level'],
            'occupancy_text' => $wagon['occupancy_text'],
            'is_recommended' => (bool) $wagon['is_recommended'],
            'updated_at' => $wagon['updated_at'],
            'train_number' => $countStats['train_number'],
            'wagon_capacity' => $countStats['wagon_capacity'],
            'current_people_count' => $countStats['current_people_count'],
            'available_space' => $countStats['available_space'],
            'occupancy_percent' => $countStats['occupancy_percent'],
            'stats_updated_at' => $countStats['stats_updated_at'],
            'stats' => $countStats
        ];

        if ((int) $wagon['is_recommended'] === 1) {
            $recommendedWagon = $item;
        }

        $formattedWagons[] = $item;
    }

    if ($recommendedWagon === null) {
        foreach ($formattedWagons as $wagon) {
            if ($wagon['occupancy_level'] === 'empty') {
                $recommendedWagon = $wagon;
                break;
            }
        }
    }

    $guidanceAvailable = false;
    $guidanceRequest = null;

    if ($recommendedWagon !== null) {
        $guidanceStmt = $pdo->prepare("
            SELECT id
            FROM station_guidance
            WHERE station_id = :station_id
              AND wagon_number = :wagon_number
              AND is_active = 1
            LIMIT 1
        ");

        $guidanceStmt->execute([
            ':station_id' => $stationId,
            ':wagon_number' => $recommendedWagon['wagon_number']
        ]);

        $guidance = $guidanceStmt->fetch();

        if ($guidance) {
            $guidanceAvailable = true;
            $guidanceRequest = [
                'station_id' => $stationId,
                'wagon_number' => (int) $recommendedWagon['wagon_number']
            ];
        }
    }

    $alertStmt = $pdo->prepare("
        SELECT
            id,
            station_id,
            alert_type,
            severity,
            title,
            message,
            description,
            expected_in_minutes,
            primary_action_text,
            primary_action_key,
            secondary_action_text,
            secondary_action_key,
            starts_at,
            ends_at
        FROM crowd_alerts
        WHERE station_id = :station_id
          AND is_active = 1
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (ends_at IS NULL OR ends_at >= NOW())
        ORDER BY id DESC
        LIMIT 1
    ");

    $alertStmt->execute([
        ':station_id' => $stationId
    ]);

    $crowdAlert = $alertStmt->fetch();
    $formattedCrowdAlert = formatCrowdAlert($crowdAlert);

    $alternativeStmt = $pdo->prepare("
        SELECT
            id,
            station_id,
            current_train_min,
            alternative_train_min,
            current_crowd_level,
            current_crowd_text,
            alternative_crowd_level,
            alternative_crowd_text,
            recommended_wagon,
            title,
            message,
            updated_at
        FROM station_train_alternatives
        WHERE station_id = :station_id
          AND is_active = 1
        LIMIT 1
    ");

    $alternativeStmt->execute([
        ':station_id' => $stationId
    ]);

    $alternative = $alternativeStmt->fetch();
    $formattedAlternativeSuggestion = formatAlternativeSuggestion($alternative);

    logAnalyticsEvent(
        $pdo,
        $user['id'],
        'live_tracking_opened',
        $stationId,
        null,
        null,
        null,
        [
            'station_name' => $station['name'],
            'line_name' => $station['line_name'],
            'train_status' => $live['train_status'],
            'next_train_min' => (int) $live['next_train_min'],
            'recommended_wagon' => $recommendedWagon ? (int) $recommendedWagon['wagon_number'] : null,
            'guidance_available' => $guidanceAvailable,
            'crowd_alert_show' => (bool) $formattedCrowdAlert['show'],
            'crowd_alert_type' => $crowdAlert ? $crowdAlert['alert_type'] : null,
            'alternative_suggestion_available' => (bool) $formattedAlternativeSuggestion['available']
        ]
    );

    response(200, true, 'Canlı izləmə məlumatları uğurla gətirildi', [
        'station' => [
            'id' => (int) $station['id'],
            'name' => $station['name'],
            'line_name' => $station['line_name']
        ],
        'train' => [
            'number' => $trainNumber,
            'status' => $live['train_status'],
            'next_train_min' => (int) $live['next_train_min'],
            'display_text' => 'Qatar ' . (int) $live['next_train_min'] . ' dəqiqəyə gəlir'
        ],
        'wagons' => $formattedWagons,
        'train_wagon_stats' => $trainWagonStats,
        'recommended_wagon' => $recommendedWagon ? [
            'wagon_number' => (int) $recommendedWagon['wagon_number'],
            'title' => 'Ən boş vaqon',
            'text' => $recommendedWagon['wagon_number'] . '-cü vaqon',
            'description' => 'Bu vaqona yönəlmək tövsiyə olunur'
        ] : null,
        'guidance_available' => $guidanceAvailable,
        'guidance_request' => $guidanceRequest,
        'crowd_alert' => $formattedCrowdAlert,
        'alternative_suggestion' => $formattedAlternativeSuggestion,
        'hint' => [
            'title' => $live['hint_title'],
            'text' => $live['hint_text']
        ],
        'updated_at' => $live['updated_at']
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
