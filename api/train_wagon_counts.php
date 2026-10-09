<?php

require_once 'db.php';

header('Content-Type: application/json; charset=utf-8');

/*
    Sadə qoruma üçün API açarı.
    Bunu öz gizli açarınla dəyiş.
    Məsələn: smartmetro_2026_secret_key
*/
define('TRAIN_WAGON_API_KEY', 'salam123');

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

function checkApiKey($input)
{
    $apiKey = trim($input['api_key'] ?? '');

    if ($apiKey === '') {
        response(401, false, 'API açarı göndərilməyib');
    }

    if ($apiKey !== TRAIN_WAGON_API_KEY) {
        response(403, false, 'API açarı yanlışdır');
    }
}

function formatWagonCount($row)
{
    return [
        'id' => (int) $row['id'],
        'train_number' => $row['train_number'],
        'wagon_number' => (int) $row['wagon_number'],
        'wagon_capacity' => (int) $row['wagon_capacity'],
        'current_people_count' => (int) $row['current_people_count'],
        'available_space' => max(0, (int) $row['wagon_capacity'] - (int) $row['current_people_count']),
        'occupancy_percent' => (int) $row['wagon_capacity'] > 0
            ? round(((int) $row['current_people_count'] / (int) $row['wagon_capacity']) * 100, 2)
            : 0,
        'updated_at' => $row['updated_at'],
        'created_at' => $row['created_at']
    ];
}

function occupancyFromCount($currentPeopleCount, $wagonCapacity)
{
    if ($wagonCapacity <= 0) {
        return [
            'level' => 'medium',
            'text' => 'Orta'
        ];
    }

    $percent = ($currentPeopleCount / $wagonCapacity) * 100;

    if ($percent >= 70) {
        return [
            'level' => 'full',
            'text' => 'Dolu'
        ];
    }

    if ($percent >= 35) {
        return [
            'level' => 'medium',
            'text' => 'Orta'
        ];
    }

    return [
        'level' => 'empty',
        'text' => 'Boş'
    ];
}

function syncStationWagonStatus($pdo, $stationId, $wagonNumber, $wagonCapacity, $currentPeopleCount)
{
    if ($stationId <= 0) {
        return null;
    }

    assertStationIsActive($pdo, $stationId);

    $occupancy = occupancyFromCount($currentPeopleCount, $wagonCapacity);

    $pdo->beginTransaction();

    $upsertStmt = $pdo->prepare("
        INSERT INTO station_wagon_status (
            station_id,
            wagon_number,
            occupancy_level,
            occupancy_text,
            is_recommended,
            updated_at
        ) VALUES (
            :station_id,
            :wagon_number,
            :occupancy_level,
            :occupancy_text,
            0,
            NOW()
        )
        ON DUPLICATE KEY UPDATE
            occupancy_level = VALUES(occupancy_level),
            occupancy_text = VALUES(occupancy_text),
            updated_at = NOW()
    ");

    $upsertStmt->execute([
        ':station_id' => $stationId,
        ':wagon_number' => $wagonNumber,
        ':occupancy_level' => $occupancy['level'],
        ':occupancy_text' => $occupancy['text']
    ]);

    $resetStmt = $pdo->prepare("
        UPDATE station_wagon_status
        SET is_recommended = 0
        WHERE station_id = :station_id
    ");

    $resetStmt->execute([
        ':station_id' => $stationId
    ]);

    $recommendStmt = $pdo->prepare("
        UPDATE station_wagon_status sws
        INNER JOIN (
            SELECT
                wagon_number
            FROM station_wagon_status
            WHERE station_id = :station_id
            ORDER BY
                CASE occupancy_level
                    WHEN 'empty' THEN 1
                    WHEN 'medium' THEN 2
                    ELSE 3
                END ASC,
                updated_at DESC,
                wagon_number ASC
            LIMIT 1
        ) best ON best.wagon_number = sws.wagon_number
        SET sws.is_recommended = 1
        WHERE sws.station_id = :station_id_update
    ");

    $recommendStmt->execute([
        ':station_id' => $stationId,
        ':station_id_update' => $stationId
    ]);

    $liveStmt = $pdo->prepare("
        UPDATE station_live_status
        SET updated_at = NOW()
        WHERE station_id = :station_id
    ");

    $liveStmt->execute([
        ':station_id' => $stationId
    ]);

    $selectStmt = $pdo->prepare("
        SELECT
            wagon_number,
            occupancy_level,
            occupancy_text,
            is_recommended,
            updated_at
        FROM station_wagon_status
        WHERE station_id = :station_id
          AND wagon_number = :wagon_number
        LIMIT 1
    ");

    $selectStmt->execute([
        ':station_id' => $stationId,
        ':wagon_number' => $wagonNumber
    ]);

    $stationWagon = $selectStmt->fetch();

    $pdo->commit();

    return [
        'station_id' => $stationId,
        'wagon_number' => (int) $stationWagon['wagon_number'],
        'occupancy_level' => $stationWagon['occupancy_level'],
        'occupancy_text' => $stationWagon['occupancy_text'],
        'is_recommended' => (bool) $stationWagon['is_recommended'],
        'updated_at' => $stationWagon['updated_at']
    ];
}

function assertStationIsActive($pdo, $stationId)
{
    $stationStmt = $pdo->prepare("
        SELECT id
        FROM stations
        WHERE id = :id
          AND is_active = 1
        LIMIT 1
    ");

    $stationStmt->execute([
        ':id' => $stationId
    ]);

    if (!$stationStmt->fetch()) {
        response(404, false, 'Stansiya tapılmadı');
    }
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
    'insert',
    'select',
    'get'
];

if (!in_array($action, $allowedActions, true)) {
    response(400, false, 'Action düzgün deyil');
}

try {
    $pdo = db();

    checkApiKey($input);

    /*
        INSERT / UPDATE
        Əgər eyni train_number + wagon_number varsa, yeniləyir.
        Yoxdursa, yeni row yaradır.
    */
    if ($action === 'insert') {
        $trainNumber = trim($input['train_number'] ?? '');
        $wagonNumber = (int) ($input['wagon_number'] ?? 0);
        $wagonCapacity = (int) ($input['wagon_capacity'] ?? 0);
        $currentPeopleCount = (int) ($input['current_people_count'] ?? 0);
        $stationId = isset($input['station_id']) ? (int) $input['station_id'] : 0;

        if ($trainNumber === '') {
            response(400, false, 'Qatar nömrəsi göndərilməyib');
        }

        if ($wagonNumber <= 0) {
            response(400, false, 'Vaqon nömrəsi düzgün deyil');
        }

        if ($wagonCapacity <= 0) {
            response(400, false, 'Vaqon tutumu düzgün deyil');
        }

        if ($currentPeopleCount < 0) {
            response(400, false, 'Cari adam sayı mənfi ola bilməz');
        }

        if ($currentPeopleCount > $wagonCapacity) {
            response(400, false, 'Cari adam sayı vaqon tutumundan çox ola bilməz');
        }

        if ($stationId > 0) {
            assertStationIsActive($pdo, $stationId);
        }

        $stmt = $pdo->prepare("
            INSERT INTO train_wagon_counts (
                train_number,
                wagon_number,
                wagon_capacity,
                current_people_count,
                created_at,
                updated_at
            ) VALUES (
                :train_number,
                :wagon_number,
                :wagon_capacity,
                :current_people_count,
                NOW(),
                NOW()
            )
            ON DUPLICATE KEY UPDATE
                wagon_capacity = VALUES(wagon_capacity),
                current_people_count = VALUES(current_people_count),
                updated_at = NOW()
        ");

        $stmt->execute([
            ':train_number' => $trainNumber,
            ':wagon_number' => $wagonNumber,
            ':wagon_capacity' => $wagonCapacity,
            ':current_people_count' => $currentPeopleCount
        ]);

        $selectStmt = $pdo->prepare("
            SELECT *
            FROM train_wagon_counts
            WHERE train_number = :train_number
              AND wagon_number = :wagon_number
            LIMIT 1
        ");

        $selectStmt->execute([
            ':train_number' => $trainNumber,
            ':wagon_number' => $wagonNumber
        ]);

        $row = $selectStmt->fetch();
        $stationWagon = syncStationWagonStatus($pdo, $stationId, $wagonNumber, $wagonCapacity, $currentPeopleCount);

        response(200, true, 'Vaqon məlumatı uğurla əlavə edildi / yeniləndi', [
            'wagon' => formatWagonCount($row),
            'station_wagon' => $stationWagon
        ]);
    }

    /*
        SELECT
        Əgər train_number göndərilsə, həmin qatarın vaqonlarını gətirir.
        Göndərilməsə, bütün qatar/vaqon datalarını gətirir.
    */
    if ($action === 'select') {
        $trainNumber = trim($input['train_number'] ?? '');

        if ($trainNumber !== '') {
            $stmt = $pdo->prepare("
                SELECT *
                FROM train_wagon_counts
                WHERE train_number = :train_number
                ORDER BY wagon_number ASC
            ");

            $stmt->execute([
                ':train_number' => $trainNumber
            ]);
        } else {
            $stmt = $pdo->prepare("
                SELECT *
                FROM train_wagon_counts
                ORDER BY train_number ASC, wagon_number ASC
            ");

            $stmt->execute();
        }

        $rows = $stmt->fetchAll();

        $wagons = [];

        foreach ($rows as $row) {
            $wagons[] = formatWagonCount($row);
        }

        response(200, true, 'Vaqon məlumatları uğurla gətirildi', [
            'train_number' => $trainNumber !== '' ? $trainNumber : null,
            'wagons' => $wagons
        ]);
    }

    /*
        GET
        Konkret 1 qatar + 1 vaqon məlumatını gətirir.
    */
    if ($action === 'get') {
        $trainNumber = trim($input['train_number'] ?? '');
        $wagonNumber = (int) ($input['wagon_number'] ?? 0);

        if ($trainNumber === '') {
            response(400, false, 'Qatar nömrəsi göndərilməyib');
        }

        if ($wagonNumber <= 0) {
            response(400, false, 'Vaqon nömrəsi düzgün deyil');
        }

        $stmt = $pdo->prepare("
            SELECT *
            FROM train_wagon_counts
            WHERE train_number = :train_number
              AND wagon_number = :wagon_number
            LIMIT 1
        ");

        $stmt->execute([
            ':train_number' => $trainNumber,
            ':wagon_number' => $wagonNumber
        ]);

        $row = $stmt->fetch();

        if (!$row) {
            response(404, false, 'Bu qatar və vaqon üçün məlumat tapılmadı');
        }

        response(200, true, 'Vaqon məlumatı uğurla gətirildi', [
            'wagon' => formatWagonCount($row)
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
