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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response(405, false, 'Bu endpoint yalnız POST metodu qəbul edir');
}

$input = getInput();

$action = trim($input['action'] ?? '');

if ($action === '') {
    response(400, false, 'Action göndərilməlidir');
}

if (!in_array($action, ['list', 'search'], true)) {
    response(400, false, 'Action düzgün deyil');
}

try {
    $pdo = db();

    if ($action === 'list') {
        $stmt = $pdo->prepare("
            SELECT
                id,
                name,
                line_name,
                is_active
            FROM stations
            WHERE is_active = 1
            ORDER BY name ASC
        ");

        $stmt->execute();

        $stations = $stmt->fetchAll();

        foreach ($stations as &$station) {
            $station['id'] = (int) $station['id'];
            $station['is_active'] = (bool) $station['is_active'];
        }

        response(200, true, 'Stansiyalar uğurla gətirildi', [
            'stations' => $stations
        ]);
    }

    if ($action === 'search') {
        $query = trim($input['query'] ?? '');

        if ($query === '') {
            response(400, false, 'Axtarış sözü boş ola bilməz');
        }

        if (mb_strlen($query) < 2) {
            response(400, false, 'Axtarış sözü minimum 2 simvol olmalıdır');
        }

        $stmt = $pdo->prepare("
            SELECT
                id,
                name,
                line_name,
                is_active
            FROM stations
            WHERE is_active = 1
              AND name LIKE :query
            ORDER BY name ASC
            LIMIT 20
        ");

        $stmt->execute([
            ':query' => '%' . $query . '%'
        ]);

        $stations = $stmt->fetchAll();

        foreach ($stations as &$station) {
            $station['id'] = (int) $station['id'];
            $station['is_active'] = (bool) $station['is_active'];
        }

        response(200, true, 'Axtarış nəticələri uğurla gətirildi', [
            'query' => $query,
            'stations' => $stations
        ]);
    }

} catch (PDOException $e) {
    response(500, false, 'Server xətası baş verdi', [
        'error' => $e->getMessage()
    ]);

} catch (Exception $e) {
    response(500, false, 'Gözlənilməz xəta baş verdi', [
        'error' => $e->getMessage()
    ]);
}