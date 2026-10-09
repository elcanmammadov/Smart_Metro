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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response(405, false, 'Bu endpoint yalnız POST metodu qəbul edir');
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    $input = $_POST;
}

$phone = trim($input['phone'] ?? '');
$password = $input['password'] ?? '';

$phone = preg_replace('/[\s\-\(\)]/', '', $phone);

if ($phone === '') {
    response(400, false, 'Telefon nömrəsi boş ola bilməz');
}

if (!preg_match('/^\+?[0-9]{9,15}$/', $phone)) {
    response(400, false, 'Telefon nömrəsi düzgün formatda deyil');
}

if ($password === '') {
    response(400, false, 'Şifrə boş ola bilməz');
}

try {
    $pdo = db();

    $stmt = $pdo->prepare("
        SELECT 
            id,
            full_name,
            phone,
            password_hash,
            status,
            deleted_at
        FROM users
        WHERE phone = :phone
        LIMIT 1
    ");

    $stmt->execute([
        ':phone' => $phone
    ]);

    $user = $stmt->fetch();

    if (!$user) {
        response(401, false, 'Telefon nömrəsi və ya şifrə yanlışdır');
    }

    if ($user['deleted_at'] !== null || $user['status'] === 'deleted') {
        response(403, false, 'Bu hesab artıq aktiv deyil');
    }

    if ($user['status'] === 'blocked') {
        response(403, false, 'Bu hesab bloklanıb');
    }

    if ($user['status'] !== 'active') {
        response(403, false, 'Bu hesab aktiv deyil');
    }

    if (!password_verify($password, $user['password_hash'])) {
        response(401, false, 'Telefon nömrəsi və ya şifrə yanlışdır');
    }

    $pdo->beginTransaction();

    $plainToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $plainToken);

    $insertTokenStmt = $pdo->prepare("
        INSERT INTO user_tokens (
            user_id,
            token_hash,
            device_name,
            ip_address,
            user_agent,
            expires_at,
            created_at
        ) VALUES (
            :user_id,
            :token_hash,
            :device_name,
            :ip_address,
            :user_agent,
            DATE_ADD(NOW(), INTERVAL 30 DAY),
            NOW()
        )
    ");

    $insertTokenStmt->execute([
        ':user_id' => $user['id'],
        ':token_hash' => $tokenHash,
        ':device_name' => $input['device_name'] ?? null,
        ':ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
        ':user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null
    ]);

    $updateLoginStmt = $pdo->prepare("
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = :id
    ");

    $updateLoginStmt->execute([
        ':id' => $user['id']
    ]);

    $pdo->commit();

    response(200, true, 'Giriş uğurla tamamlandı', [
        'user' => [
            'id' => (int) $user['id'],
            'full_name' => $user['full_name'],
            'phone' => $user['phone']
        ],
        'token' => $plainToken,
        'token_type' => 'Bearer',
        'expires_in_days' => 30
    ]);

} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    response(500, false, 'Server xətası baş verdi. Zəhmət olmasa yenidən cəhd edin');

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    response(500, false, 'Gözlənilməz xəta baş verdi');
}