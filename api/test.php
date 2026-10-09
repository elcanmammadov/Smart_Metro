<?php

require_once 'db.php';

$pdo = db();

echo json_encode([
    "success" => true,
    "message" => "Database bağlantısı uğurludur"
], JSON_UNESCAPED_UNICODE);