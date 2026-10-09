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

function formatStep($row)
{
    return [
        'order' => (int) $row['step_order'],
        'type' => $row['step_type'],
        'title' => $row['title'],
        'subtitle' => $row['subtitle'],
        'icon_key' => $row['icon_key'],
        'distance_meters' => $row['distance_meters'] !== null ? (int) $row['distance_meters'] : null,
        'duration_min' => $row['duration_min'] !== null ? (int) $row['duration_min'] : null,
        'metadata' => $row['metadata'] ? json_decode($row['metadata'], true) : null
    ];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response(405, false, 'Bu endpoint yalnız POST metodu qəbul edir');
}

$input = getInput();

$stationId = (int) ($input['station_id'] ?? 0);
$wagonNumber = (int) ($input['wagon_number'] ?? 0);

if ($stationId <= 0) {
    response(400, false, 'Stansiya ID düzgün göndərilməyib');
}

if ($wagonNumber <= 0) {
    response(400, false, 'Vaqon nömrəsi düzgün göndərilməyib');
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

    $guidanceStmt = $pdo->prepare("
        SELECT
            id,
            station_id,
            wagon_number,
            title,
            description,
            updated_at
        FROM station_guidance
        WHERE station_id = :station_id
          AND wagon_number = :wagon_number
          AND is_active = 1
        LIMIT 1
    ");

    $guidanceStmt->execute([
        ':station_id' => $stationId,
        ':wagon_number' => $wagonNumber
    ]);

    $guidance = $guidanceStmt->fetch();

    if (!$guidance) {
        response(404, false, 'Bu stansiya və vaqon üçün yönləndirmə tapılmadı');
    }

    $stepsStmt = $pdo->prepare("
        SELECT
            step_order,
            step_type,
            title,
            subtitle,
            icon_key,
            distance_meters,
            duration_min,
            metadata
        FROM station_guidance_steps
        WHERE guidance_id = :guidance_id
        ORDER BY step_order ASC
    ");

    $stepsStmt->execute([
        ':guidance_id' => $guidance['id']
    ]);

    $stepsRows = $stepsStmt->fetchAll();

    $steps = [];

    foreach ($stepsRows as $row) {
        $steps[] = formatStep($row);
    }

    $tipsStmt = $pdo->prepare("
        SELECT
            title,
            description,
            image_url
        FROM station_guidance_tips
        WHERE guidance_id = :guidance_id
          AND is_active = 1
        ORDER BY id ASC
        LIMIT 1
    ");

    $tipsStmt->execute([
        ':guidance_id' => $guidance['id']
    ]);

    $tip = $tipsStmt->fetch();

    $visualsStmt = $pdo->prepare("
        SELECT
            visual_order,
            title,
            description,
            image_url
        FROM station_guidance_visuals
        WHERE guidance_id = :guidance_id
          AND is_active = 1
        ORDER BY visual_order ASC
    ");

    $visualsStmt->execute([
        ':guidance_id' => $guidance['id']
    ]);

    $visualRows = $visualsStmt->fetchAll();

    $visuals = [];

    foreach ($visualRows as $visual) {
        $visuals[] = [
            'order' => (int) $visual['visual_order'],
            'title' => $visual['title'],
            'description' => $visual['description'],
            'image_url' => $visual['image_url']
        ];
    }

    $cacheKey = 'guidance_' . $stationId . '_' . $wagonNumber;

    logAnalyticsEvent(
        $pdo,
        $user['id'],
        'guidance_opened',
        $stationId,
        null,
        null,
        null,
        [
            'station_name' => $station['name'],
            'line_name' => $station['line_name'],
            'guidance_id' => (int) $guidance['id'],
            'wagon_number' => (int) $guidance['wagon_number'],
            'steps_count' => count($steps),
            'has_tip' => $tip ? true : false,
            'visuals_count' => count($visuals),
            'cache_key' => $cacheKey
        ]
    );

    response(200, true, 'Yönləndirmə məlumatları uğurla gətirildi', [
        'station' => [
            'id' => (int) $station['id'],
            'name' => $station['name'],
            'line_name' => $station['line_name']
        ],
        'guidance' => [
            'id' => (int) $guidance['id'],
            'wagon_number' => (int) $guidance['wagon_number'],
            'title' => $guidance['title'],
            'description' => $guidance['description'],
            'updated_at' => $guidance['updated_at']
        ],
        'steps' => $steps,
        'tip' => $tip ? [
            'title' => $tip['title'],
            'description' => $tip['description'],
            'image_url' => $tip['image_url']
        ] : null,
        'visuals' => $visuals,
        'cache' => [
            'enabled' => true,
            'cache_key' => $cacheKey,
            'ttl_minutes' => 60,
            'offline_ready' => true
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