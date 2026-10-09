<?php
declare(strict_types=1);

// JSON API üçün default headerlər
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Preflight (OPTIONS) üçün tez cavab
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}


// Database məlumatları
define('DB_HOST', 'localhost');
define('DB_NAME', 'u879108216_smartmetro');
define('DB_USER', 'u879108216_smartmetro');
// Parol db.local.php-dən (git-ə düşmür) və ya DB_PASS env dəyişənindən oxunur
if (is_file(__DIR__ . '/db.local.php')) {
  require __DIR__ . '/db.local.php';
}
if (!defined('DB_PASS')) {
  define('DB_PASS', getenv('DB_PASS') ?: '');
} // XAMPP istifadə edirsənsə çox vaxt boş olur
define('DB_CHARSET', 'utf8mb4');

function db()
{
    static $pdo = null;

    if ($pdo === null) {
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            http_response_code(500);

            echo json_encode([
                "success" => false,
                "message" => "Database bağlantısı alınmadı",
                "error" => $e->getMessage()
            ], JSON_UNESCAPED_UNICODE);

            exit;
        }
    }

    return $pdo;
}