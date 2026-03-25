// Ficheiro: middlewares/ticketAttachmentUploadMiddleware.js

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Define o caminho para a pasta de uploads de anexos de tickets
// Aponta para backend/public/uploads/ticket_attachments
const uploadDir = path.join(__dirname, '../public/uploads/ticket_attachments');

// Tipos permitidos para anexos de ticket (evita executáveis/HTML potencialmente perigosos)
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.doc', '.docx']);
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

// Garante que o diretório de upload exista
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração de armazenamento para o Multer
const storage = multer.diskStorage({
  // Define a pasta de destino para os ficheiros
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  // Define como o ficheiro será nomeado
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Sanitiza o nome original para evitar problemas com caracteres especiais
    const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, 'attachment-' + uniqueSuffix + '-' + sanitizedOriginalName);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error('Tipo de ficheiro não permitido. Utilize PDF, imagens (JPEG, PNG, GIF, WebP) ou Word (.doc/.docx).'));
  }

  // Alguns clientes podem enviar octet-stream; aceitamos nesses casos se a extensão for válida
  if (!ALLOWED_MIMES.has(mime) && mime !== 'application/octet-stream') {
    return cb(new Error('Tipo MIME não permitido para anexos de ticket.'));
  }

  return cb(null, true);
};

// Configuração final do Multer
const upload = multer({
  storage: storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

module.exports = upload;