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

function buildShortestRoute($stations, $connections, $fromStationId, $toStationId, $avoidStationId = null)
{
    $graph = [];

    foreach ($stations as $stationId => $station) {
        $graph[$stationId] = [];
    }

    foreach ($connections as $connection) {
        $from = (int) $connection['from_station_id'];
        $to = (int) $connection['to_station_id'];
        $duration = (int) $connection['duration_min'];

        if ($avoidStationId !== null) {
            if ($from === $avoidStationId || $to === $avoidStationId) {
                continue;
            }
        }

        $graph[$from][] = [
            'to' => $to,
            'duration_min' => $duration
        ];
    }

    $distances = [];
    $previous = [];
    $visited = [];

    foreach ($stations as $stationId => $station) {
        $distances[$stationId] = PHP_INT_MAX;
        $previous[$stationId] = null;
        $visited[$stationId] = false;
    }

    $distances[$fromStationId] = 0;

    $queue = new SplPriorityQueue();
    $queue->setExtractFlags(SplPriorityQueue::EXTR_DATA);
    $queue->insert($fromStationId, 0);

    while (!$queue->isEmpty()) {
        $currentStationId = (int) $queue->extract();

        if ($visited[$currentStationId]) {
            continue;
        }

        $visited[$currentStationId] = true;

        if ($currentStationId === $toStationId) {
            break;
        }

        foreach ($graph[$currentStationId] ?? [] as $edge) {
            $nextStationId = (int) $edge['to'];
            $duration = (int) $edge['duration_min'];

            if ($visited[$nextStationId]) {
                continue;
            }

            $newDistance = $distances[$currentStationId] + $duration;

            if ($newDistance < $distances[$nextStationId]) {
                $distances[$nextStationId] = $newDistance;
                $previous[$nextStationId] = $currentStationId;

                $queue->insert($nextStationId, -$newDistance);
            }
        }
    }

    if ($distances[$toStationId] === PHP_INT_MAX) {
        return null;
    }

    $path = [];
    $current = $toStationId;

    while ($current !== null) {
        array_unshift($path, $current);
        $current = $previous[$current];
    }

    return [
        'duration_min' => $distances[$toStationId],
        'path' => $path
    ];
}

function getDurationBetween($connections, $fromStationId, $toStationId)
{
    foreach ($connections as $connection) {
        if (
            (int) $connection['from_station_id'] === (int) $fromStationId &&
            (int) $connection['to_station_id'] === (int) $toStationId
        ) {
            return (int) $connection['duration_min'];
        }
    }

    return 0;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response(405, false, 'Bu endpoint yalnız POST metodu qəbul edir');
}

$input = getInput();

$fromStationId = (int) ($input['from_station_id'] ?? 0);
$toStationId = (int) ($input['to_station_id'] ?? 0);

$routeType = trim($input['route_type'] ?? 'optimal');
$avoidStationId = isset($input['avoid_station_id']) ? (int) $input['avoid_station_id'] : null;

$allowedRouteTypes = ['optimal', 'alternative'];

if (!in_array($routeType, $allowedRouteTypes, true)) {
    response(400, false, 'route_type düzgün deyil. optimal və ya alternative olmalıdır');
}

if ($fromStationId <= 0) {
    response(400, false, 'Başlanğıc stansiya düzgün göndərilməyib');
}

if ($toStationId <= 0) {
    response(400, false, 'Gediləcək stansiya düzgün göndərilməyib');
}

if ($fromStationId === $toStationId) {
    response(400, false, 'Başlanğıc və gediləcək stansiya eyni ola bilməz');
}

if ($routeType === 'alternative' && ($avoidStationId === null || $avoidStationId <= 0)) {
    response(400, false, 'Alternativ marşrut üçün avoid_station_id göndərilməlidir');
}

try {
    $pdo = db();

    $user = authUser($pdo, $input);

    $stationsStmt = $pdo->prepare("
        SELECT
            id,
            name,
            line_name,
            is_active
        FROM stations
        WHERE is_active = 1
        ORDER BY id ASC
    ");

    $stationsStmt->execute();

    $stationRows = $stationsStmt->fetchAll();

    if (!$stationRows) {
        response(404, false, 'Aktiv stansiya tapılmadı');
    }

    $stations = [];

    foreach ($stationRows as $station) {
        $stations[(int) $station['id']] = [
            'id' => (int) $station['id'],
            'name' => $station['name'],
            'line_name' => $station['line_name']
        ];
    }

    if (!isset($stations[$fromStationId])) {
        response(404, false, 'Başlanğıc stansiya tapılmadı');
    }

    if (!isset($stations[$toStationId])) {
        response(404, false, 'Gediləcək stansiya tapılmadı');
    }

    if ($avoidStationId !== null && !isset($stations[$avoidStationId])) {
        response(404, false, 'Yan keçiləcək stansiya tapılmadı');
    }

    $connectionsStmt = $pdo->prepare("
        SELECT
            from_station_id,
            to_station_id,
            duration_min
        FROM station_connections
    ");

    $connectionsStmt->execute();

    $connections = $connectionsStmt->fetchAll();

    if (!$connections) {
        response(404, false, 'Marşrut bağlantıları tapılmadı');
    }

    $alternativeRequested = $routeType === 'alternative';
    $alternativeFound = false;
    $alternativeMessage = 'Standart optimal marşrut göstərildi';
    $usedAvoidStationId = null;

    $shortestRoute = null;

    if ($alternativeRequested) {
        if ($avoidStationId === $fromStationId || $avoidStationId === $toStationId) {
            $alternativeFound = false;
            $alternativeMessage = 'Yan keçiləcək stansiya başlanğıc və ya son stansiya olduğu üçün alternativ marşrut mümkün deyil';
        } else {
            $alternativeRoute = buildShortestRoute(
                $stations,
                $connections,
                $fromStationId,
                $toStationId,
                $avoidStationId
            );

            if ($alternativeRoute) {
                $shortestRoute = $alternativeRoute;
                $alternativeFound = true;
                $usedAvoidStationId = $avoidStationId;
                $alternativeMessage = 'Alternativ marşrut tapıldı';
            } else {
                $alternativeFound = false;
                $alternativeMessage = 'Alternativ marşrut tapılmadı, ən optimal marşrut göstərildi';
            }
        }
    }

    if (!$shortestRoute) {
        $shortestRoute = buildShortestRoute(
            $stations,
            $connections,
            $fromStationId,
            $toStationId
        );
    }

    if (!$shortestRoute) {
        response(404, false, 'Bu iki stansiya arasında marşrut tapılmadı');
    }

    $path = $shortestRoute['path'];

    $formattedStations = [];
    $transfers = [];
    $transferCount = 0;

    foreach ($path as $index => $stationId) {
        $station = $stations[$stationId];

        $durationFromPrevious = 0;
        $isTransferPoint = false;

        if ($index > 0) {
            $previousStationId = $path[$index - 1];
            $previousStation = $stations[$previousStationId];

            $durationFromPrevious = getDurationBetween(
                $connections,
                $previousStationId,
                $stationId
            );

            if ($previousStation['line_name'] !== $station['line_name']) {
                $transferCount++;
                $isTransferPoint = true;

                $transfers[] = [
                    'order' => $transferCount,
                    'from_station' => [
                        'id' => (int) $previousStation['id'],
                        'name' => $previousStation['name'],
                        'line_name' => $previousStation['line_name']
                    ],
                    'to_station' => [
                        'id' => (int) $station['id'],
                        'name' => $station['name'],
                        'line_name' => $station['line_name']
                    ],
                    'from_line' => $previousStation['line_name'],
                    'to_line' => $station['line_name'],
                    'transfer_text' => $previousStation['line_name'] . ' → ' . $station['line_name']
                ];
            }
        }

        $formattedStations[] = [
            'order' => $index + 1,
            'id' => (int) $station['id'],
            'name' => $station['name'],
            'line_name' => $station['line_name'],
            'display_name' => $station['name'] . ' (' . $station['line_name'] . ')',
            'duration_from_previous_min' => $durationFromPrevious,
            'is_transfer_point' => $isTransferPoint
        ];
    }

    $crowdStmt = $pdo->prepare("
        SELECT
            crowd_level,
            crowd_text
        FROM station_crowd_status
        WHERE station_id = :station_id
        LIMIT 1
    ");

    $crowdStmt->execute([
        ':station_id' => $toStationId
    ]);

    $crowd = $crowdStmt->fetch();

    $pathTextDetailed = [];

    foreach ($formattedStations as $station) {
        $pathTextDetailed[] = $station['display_name'];
    }

    $alternativeData = [
        'requested' => $alternativeRequested,
        'found' => $alternativeFound,
        'avoid_station_id' => $avoidStationId,
        'used_avoid_station_id' => $usedAvoidStationId,
        'avoid_station' => $avoidStationId && isset($stations[$avoidStationId]) ? [
            'id' => (int) $stations[$avoidStationId]['id'],
            'name' => $stations[$avoidStationId]['name'],
            'line_name' => $stations[$avoidStationId]['line_name']
        ] : null,
        'message' => $alternativeMessage
    ];

    logAnalyticsEvent(
        $pdo,
        $user['id'],
        'route_calculated',
        null,
        $fromStationId,
        $toStationId,
        null,
        [
            'route_type' => $routeType,
            'alternative_requested' => $alternativeRequested,
            'alternative_found' => $alternativeFound,
            'avoid_station_id' => $avoidStationId,
            'duration_min' => (int) $shortestRoute['duration_min'],
            'transfer_count' => $transferCount,
            'station_count' => count($formattedStations),
            'from_station_name' => $stations[$fromStationId]['name'],
            'to_station_name' => $stations[$toStationId]['name']
        ]
    );

    response(200, true, 'Marşrut uğurla hesablandı', [
        'route' => [
            'route_type' => $routeType,
            'from_station' => [
                'id' => (int) $stations[$fromStationId]['id'],
                'name' => $stations[$fromStationId]['name'],
                'line_name' => $stations[$fromStationId]['line_name']
            ],
            'to_station' => [
                'id' => (int) $stations[$toStationId]['id'],
                'name' => $stations[$toStationId]['name'],
                'line_name' => $stations[$toStationId]['line_name']
            ],
            'duration_min' => (int) $shortestRoute['duration_min'],
            'crowd_level' => $crowd['crowd_level'] ?? 'low',
            'crowd_text' => $crowd['crowd_text'] ?? 'Aşağı',
            'transfer_count' => $transferCount,
            'station_count' => count($formattedStations),
            'path_text_detailed' => implode(' → ', $pathTextDetailed),
            'alternative' => $alternativeData,
            'transfers' => $transfers,
            'stations' => $formattedStations
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