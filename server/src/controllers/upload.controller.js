import { uploadEventImage } from '../utils/cloudinary.js';

export async function uploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'Nenhuma imagem enviada.' });
  }

  try {
    const result = await uploadEventImage(req.file.buffer);
    res.status(201).json({ url: result.secure_url });
  } catch (err) {
    res.status(err.message?.includes('não configurado') ? 503 : 500).json({
      message: err.message || 'Não foi possível enviar a imagem.',
    });
  }
}
