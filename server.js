const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const gs = require('ghostscript4js');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const app = express();
const upload = multer({ dest: os.tmpdir() });

app.use(express.static('public')); // Serve static files (e.g., compress-pdf.html)

app.post('/compress', upload.single('pdf'), async (req, res) => {
    try {
        const { file } = req;
        const { targetSize, quality, optimizeImages, removeMetadata, downsampleImages } = req.body;

        if (!file || !file.mimetype.includes('pdf')) {
            return res.status(400).json({ error: 'Please upload a valid PDF file.' });
        }

        const inputPath = file.path;
        const outputPath = path.join(os.tmpdir(), `compressed-${Date.now()}.pdf`);

        // Map quality (0-100) to Ghostscript settings
        let pdfSettings;
        const qualityValue = parseInt(quality);
        if (qualityValue <= 33) {
            pdfSettings = '/screen'; // Low quality
        } else if (qualityValue <= 66) {
            pdfSettings = '/printer'; // Medium quality
        } else {
            pdfSettings = '/prepress'; // High quality
        }

        // Build Ghostscript command
        const gsArgs = [
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            `-dPDFSETTINGS=${pdfSettings}`,
            '-dNOPAUSE',
            '-dQUIET',
            '-dBATCH'
        ];

        if (optimizeImages === 'true') {
            gsArgs.push('-dColorImageDownsampleType=/Bicubic', '-dColorImageResolution=150');
        }
        if (downsampleImages === 'true') {
            gsArgs.push('-dDownsampleColorImages=true', '-dColorImageResolution=72');
        }

        gsArgs.push(`-sOutputFile=${outputPath}`, inputPath);

        // Execute Ghostscript compression
        await gs.exec(gsArgs);

        // Load the compressed PDF
        let pdfBytes = await fs.readFile(outputPath);
        
        // Remove metadata if requested
        if (removeMetadata === 'true') {
            const pdfDoc = await PDFDocument.load(pdfBytes);
            pdfDoc.setTitle('');
            pdfDoc.setAuthor('');
            pdfDoc.setSubject('');
            pdfDoc.setKeywords([]);
            pdfDoc.setProducer('');
            pdfDoc.setCreator('');
            pdfBytes = await pdfDoc.save();
        }

        // If targetSize is specified, check if achieved (simplified)
        const targetSizeMB = parseFloat(targetSize);
        const compressedSizeMB = pdfBytes.length / (1024 * 1024);
        if (targetSizeMB && compressedSizeMB > targetSizeMB) {
            console.warn('Target size not fully achieved:', compressedSizeMB, 'MB');
        }

        // Send compressed PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=PDFMagic.pdf');
        res.send(pdfBytes);

        // Clean up temporary files
        await fs.unlink(inputPath);
        await fs.unlink(outputPath);
    } catch (error) {
        console.error('Compression error:', error);
        res.status(500).json({ error: 'An error occurred during compression.' });
        // Clean up temporary files if they exist
        if (req.file && req.file.path) {
            await fs.unlink(req.file.path).catch(() => {});
        }
        if (await fs.access(outputPath).then(() => true).catch(() => false)) {
            await fs.unlink(outputPath).catch(() => {});
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});