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

function getBearerToken()
{
    $headers = getallheaders();

    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';

    if (!$authHeader && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    }

    if (preg_match('/Bearer\s+(.+)/i', $authHeader, $matches)) {
        return trim($matches[1]);
    }

    return null;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response(405, false, 'Bu endpoint yalnız POST metodu qəbul edir');
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input)) {
    $input = $_POST;
}

$token = getBearerToken();

if (!$token) {
    $token = trim($input['token'] ?? '');
}

$newPassword = $input['new_password'] ?? '';
$confirmPassword = $input['confirm_password'] ?? '';

if ($token === '') {
    response(401, false, 'Reset token göndərilməyib');
}

if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
    response(401, false, 'Reset token düzgün formatda deyil');
}

if ($newPassword === '') {
    response(400, false, 'Yeni şifrə boş ola bilməz');
}

if (strlen($newPassword) < 8) {
    response(400, false, 'Yeni şifrə minimum 8 simvol olmalıdır');
}

if ($confirmPassword === '') {
    response(400, false, 'Şifrə təkrarı boş ola bilməz');
}

if ($newPassword !== $confirmPassword) {
    response(400, false, 'Yeni şifrə və şifrə təkrarı eyni deyil');
}

try {
    $pdo = db();

    $tokenHash = hash('sha256', $token);

    $tokenStmt = $pdo->prepare("
        SELECT 
            t.id AS token_id,
            t.user_id,
            t.expires_at,
            t.revoked_at,

            u.id,
            u.full_name,
            u.phone,
            u.status,
            u.deleted_at
        FROM user_tokens t
        INNER JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = :token_hash
          AND t.token_type = 'password_reset'
        LIMIT 1
    ");

    $tokenStmt->execute([
        ':token_hash' => $tokenHash
    ]);

    $resetToken = $tokenStmt->fetch();

    if (!$resetToken) {
        response(401, false, 'Reset token yanlışdır');
    }

    if ($resetToken['revoked_at'] !== null) {
        response(401, false, 'Reset token artıq istifadə edilib');
    }

    if (strtotime($resetToken['expires_at']) < time()) {
        response(410, false, 'Reset tokenin vaxtı bitib. Yenidən OTP tələb edin');
    }

    if ($resetToken['deleted_at'] !== null || $resetToken['status'] === 'deleted') {
        response(403, false, 'Bu hesab artıq aktiv deyil');
    }

    if ($resetToken['status'] === 'blocked') {
        response(403, false, 'Bu hesab bloklanıb');
    }

    if ($resetToken['status'] !== 'active') {
        response(403, false, 'Bu hesab aktiv deyil');
    }

    $pdo->beginTransaction();

    $newPasswordHash = password_hash($newPassword, PASSWORD_DEFAULT);

    $updatePasswordStmt = $pdo->prepare("
        UPDATE users
        SET 
            password_hash = :password_hash,
            updated_at = NOW()
        WHERE id = :user_id
    ");

    $updatePasswordStmt->execute([
        ':password_hash' => $newPasswordHash,
        ':user_id' => $resetToken['user_id']
    ]);

    $revokeResetTokenStmt = $pdo->prepare("
        UPDATE user_tokens
        SET revoked_at = NOW()
        WHERE id = :token_id
    ");

    $revokeResetTokenStmt->execute([
        ':token_id' => $resetToken['token_id']
    ]);

    $revokeOldLoginTokensStmt = $pdo->prepare("
        UPDATE user_tokens
        SET revoked_at = NOW()
        WHERE user_id = :user_id
          AND token_type = 'auth'
          AND revoked_at IS NULL
    ");

    $revokeOldLoginTokensStmt->execute([
        ':user_id' => $resetToken['user_id']
    ]);

    $pdo->commit();

    response(200, true, 'Şifrə uğurla yeniləndi. Zəhmət olmasa yenidən giriş edin', [
        'user' => [
            'id' => (int) $resetToken['user_id'],
            'full_name' => $resetToken['full_name'],
            'phone' => $resetToken['phone']
        ]
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