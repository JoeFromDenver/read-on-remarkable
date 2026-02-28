document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTS & CONFIGURATION ---
    const model = "gemini-3-flash-preview";

    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;

    const DEVICE_PROFILES = {
        PRO_MOVE: {
            name: 'reMarkable Paper Pro Move',
            format: [954 / 1.5, 1696 / 1.5], // ~636x1130
            margins: { top: 100, right: 50, bottom: 40, left: 50 },
            fontSize: 22,
            lineHeight: 1.5
        },
        PRO: {
            name: 'reMarkable Paper Pro',
            format: [1620 / 1.5, 2160 / 1.5], // 1080x1440
            margins: { top: 120, right: 60, bottom: 50, left: 60 },
            fontSize: 28,
            lineHeight: 1.5
        }
    };

    // Keep the base64 icons
    const ICON_DATA = {
        PRO_MOVE: 'data:image/jpeg;base64,...', // We'll re-insert the actual base64 to save space in code here
        PRO: 'data:image/jpeg;base64,...'
    };

    // Fill the actual base64 icons later to not clog the editing flow initially, or just keep them small if possible.
    // I will extract them from the original code.

    // --- DOM ELEMENTS ---
    const urlInput = document.getElementById('url-input');
    const pdfUploadInput = document.getElementById('pdf-upload');
    const btnQuickPdf = document.getElementById('btn-quick-pdf');
    const btnReadNative = document.getElementById('btn-read-native');
    const btnProcessPdf = document.getElementById('btn-process-pdf');

    // Reading Mode DOM
    const homeView = document.querySelector('.main-container');
    const readingView = document.getElementById('reading-view');
    const btnCloseReading = document.getElementById('btn-close-reading');
    const btnReadingPdf = document.getElementById('btn-reading-pdf');
    const newspaperContent = document.getElementById('newspaper-content');

    const statusDiv = document.getElementById('status');
    const pasteBtn = document.getElementById('paste-btn');
    const historySection = document.getElementById('history-section');
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const fileUploadContent = document.querySelector('.file-upload-content');
    const fileNameDisplay = document.getElementById('file-name-display');
    const apiKeyInput = document.getElementById('api-key-input');
    const toggleKeyBtn = document.getElementById('toggle-key-btn');
    const toggleKeyIcon = document.getElementById('toggle-key-icon');
    const apiKeyGroup = document.getElementById('api-key-group');
    const pdfUploadGroup = document.getElementById('pdf-upload-group');
    const extractionToggle = document.getElementById('extraction-toggle');

    // --- EVENT LISTENERS ---
    btnQuickPdf.addEventListener('click', () => startConversion('pdf'));
    btnReadNative.addEventListener('click', () => startConversion('native'));
    btnProcessPdf.addEventListener('click', () => {
        const file = pdfUploadInput.files[0];
        if (file) handlePdfConversion(file);
        else updateStatus('Please select a PDF first.', 'error');
    });

    btnCloseReading.addEventListener('click', () => {
        readingView.classList.add('hidden');
        homeView.classList.remove('hidden');
    });

    let currentReadingArticleData = null;
    btnReadingPdf.addEventListener('click', async () => {
        if (!currentReadingArticleData) return;
        updateStatus('Formatting PDF...', 'info');
        // Briefly swap to home view to show loading state from top layer, though loading overlay handles it globally
        await generatePdf(currentReadingArticleData);
    });

    pasteBtn.addEventListener('click', pasteFromClipboard);

    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') startConversion('pdf');
    });

    urlInput.addEventListener('input', () => {
        pasteBtn.style.display = urlInput.value.trim() === '' ? 'flex' : 'none';
        if (urlInput.value.trim() !== '') {
            pdfUploadGroup.removeAttribute('open');
        }
    });

    clearHistoryBtn.addEventListener('click', clearHistory);

    toggleKeyBtn.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleKeyIcon.textContent = 'visibility_off';
        } else {
            apiKeyInput.type = 'password';
            toggleKeyIcon.textContent = 'visibility';
        }
    });

    apiKeyInput.addEventListener('change', () => {
        localStorage.setItem('geminiApiKey', apiKeyInput.value.trim());
        updateStatus('API key saved locally.', 'success');
        setTimeout(() => {
            if (statusDiv.textContent === 'API key saved locally.') {
                statusDiv.classList.remove('visible');
            }
        }, 3000);
    });

    // File Drag and Drop / Selection listeners
    pdfUploadInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            updateFileNameDisplay(e.target.files[0].name);
            urlInput.value = ''; // Clear URL if file is selected
            pasteBtn.style.display = 'flex';
        }
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileUploadContent.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        fileUploadContent.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        fileUploadContent.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        fileUploadContent.classList.add('dragover');
    }

    function unhighlight(e) {
        fileUploadContent.classList.remove('dragover');
    }

    fileUploadContent.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        let dt = e.dataTransfer;
        let files = dt.files;
        pdfUploadInput.files = files; // Assign to input

        if (files.length > 0) {
            updateFileNameDisplay(files[0].name);
            urlInput.value = '';
            pasteBtn.style.display = 'flex';
        }
    }

    function updateFileNameDisplay(name) {
        fileNameDisplay.textContent = `Selected: ${name}`;
        fileNameDisplay.classList.remove('hidden');
    }

    // --- INITIALIZATION ---
    loadHistory();
    registerServiceWorker();

    const savedApiKey = localStorage.getItem('geminiApiKey');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
    } else {
        apiKeyGroup.setAttribute('open', '');
    }

    // --- WEB SHARE TARGET HANDLING ---
    handleSharedUrl();

    function handleSharedUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        let sharedUrl = urlParams.get('url') || urlParams.get('text');

        if (sharedUrl) {
            // Android sometimes sends a mix of text and URL. Extract just the URL.
            const urlMatch = sharedUrl.match(/(https?:\/\/[^\s]+)/g);
            if (urlMatch) {
                sharedUrl = urlMatch[0];
            }

            if (sharedUrl.startsWith('http')) {
                urlInput.value = sharedUrl;
                pasteBtn.style.display = 'none';

                // Remove the query parameters from the URL bar so refresh doesn't trigger again
                window.history.replaceState({}, document.title, window.location.pathname);

                // Delay slightly to let the UI finish rendering before blasting the API
                setTimeout(startConversion, 500);
            }
        }
    }

    // --- HELPER FUNCTIONS ---
    function updateStatus(message, type = 'info') {
        statusDiv.textContent = message;
        statusDiv.className = 'status-message visible'; // Reset classes

        switch (type) {
            case 'error':
                statusDiv.classList.add('status-error');
                break;
            case 'success':
                statusDiv.classList.add('status-success');
                break;
            case 'info':
                statusDiv.classList.add('status-info');
                break;
        }

        if (type !== 'info') {
            setTimeout(() => {
                if (statusDiv.textContent === message) {
                    statusDiv.classList.remove('visible');
                }
            }, 5000);
        }
    }

    function toggleLoading(isLoading) {
        btnQuickPdf.disabled = isLoading;
        btnReadNative.disabled = isLoading;
        btnProcessPdf.disabled = isLoading;
        urlInput.disabled = isLoading;
        pdfUploadInput.disabled = isLoading;

        if (isLoading) {
            btnQuickPdf.innerHTML = `
                <span class="material-symbols-outlined spinner">progress_activity</span>
                Processing...
            `;
        } else {
            btnQuickPdf.innerHTML = `
                <span class="icon-wrapper">
                    <span class="material-symbols-outlined">picture_as_pdf</span>
                </span>
                Quick PDF
            `;
        }
    }

    async function fetchWithBackoff(url, options, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.status === 429 || response.status >= 500) {
                    throw new Error(`Server error: ${response.status}`);
                }
                return response;
            } catch (error) {
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
            }
        }
    }

    async function processImageForPaperPro(imageBuffer) {
        return new Promise((resolve, reject) => {
            try {
                const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imgData.data;

                    // Boost Contrast (1.25x) and Saturation (1.35x)
                    const contrastFactor = 1.25;
                    const saturationFactor = 1.35;
                    const intercept = 128 * (1 - contrastFactor);

                    for (let i = 0; i < data.length; i += 4) {
                        let r = data[i], g = data[i + 1], b = data[i + 2];

                        // Contrast
                        r = r * contrastFactor + intercept;
                        g = g * contrastFactor + intercept;
                        b = b * contrastFactor + intercept;

                        // Saturation 
                        const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                        r = gray + saturationFactor * (r - gray);
                        g = gray + saturationFactor * (g - gray);
                        b = gray + saturationFactor * (b - gray);

                        // Clamp
                        data[i] = Math.max(0, Math.min(255, r));
                        data[i + 1] = Math.max(0, Math.min(255, g));
                        data[i + 2] = Math.max(0, Math.min(255, b));
                    }

                    ctx.putImageData(imgData, 0, 0);

                    canvas.toBlob((blob) => {
                        blob.arrayBuffer().then(resolve).catch(reject);
                    }, 'image/jpeg', 0.9);
                };
                img.onerror = () => {
                    console.warn("Could not process image for Paper Pro.");
                    resolve(imageBuffer);
                };
                img.src = URL.createObjectURL(blob);
            } catch (error) {
                resolve(imageBuffer);
            }
        });
    }

    function convertWebPToJpeg(webpArrayBuffer) {
        return new Promise((resolve, reject) => {
            const blob = new Blob([webpArrayBuffer], { type: 'image/webp' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(jpegBlob => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsArrayBuffer(jpegBlob);
                }, 'image/jpeg', 0.9);
                URL.revokeObjectURL(url);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load WebP image for conversion.'));
            };
            img.src = url;
        });
    }

    function sanitizeFilename(title) {
        if (!title) return 'document';
        let sanitized = title.replace(/[/\\?%*:|"<>]/g, '');
        sanitized = sanitized.replace(/[^a-z0-9\-\s]/gi, ' ');
        sanitized = sanitized.replace(/\s+/g, ' ').trim();
        return sanitized || 'document';
    }

    async function pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text;
                urlInput.focus();
                urlInput.dispatchEvent(new Event('input'));

                // Clear file input if url is pasted
                pdfUploadInput.value = '';
                fileNameDisplay.classList.add('hidden');
            }
        } catch (err) {
            console.error('Failed to read clipboard: ', err);
            updateStatus('Could not paste from clipboard. Please grant permission.', 'error');
        }
    }

    // --- CORE LOGIC ---
    function startConversion(mode = 'pdf') {
        const url = urlInput.value.trim();

        if (!url) {
            updateStatus('Please enter an Article URL.', 'error');
            return;
        }

        // Check for API key if they are using the AI engine
        if (!extractionToggle.checked) {
            const apiKey = localStorage.getItem('geminiApiKey');
            if (!apiKey || apiKey.trim() === '') {
                updateStatus('Please enter your Gemini API Key first.', 'error');
                apiKeyGroup.setAttribute('open', '');
                apiKeyInput.focus();
                return;
            }
        }

        handleUrlConversion(url, mode);
    }

    async function handleUrlConversion(url, mode) {
        toggleLoading(true);
        try {
            updateStatus('Fetching article content...', 'info');
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const response = await fetchWithBackoff(proxyUrl);
            if (!response.ok) throw new Error(`Failed to fetch URL (Status: ${response.status})`);
            const html = await response.text();

            let articleData = null;

            if (!extractionToggle.checked) {
                // Detailed (AI) extraction
                updateStatus('Asking AI model to extract article...', 'info');
                articleData = await callGeminiForUrl(html, url);
            } else {
                // Fast (Local) extraction via Readability.js
                updateStatus('Parsing article locally...', 'info');
                articleData = await extractWithReadability(html, url);

                // If Readability fails or returns garbage, auto-fallback to AI (if key exists)
                if (!articleData.title || !articleData.articleBodyHtml || articleData.articleBodyHtml.trim().length < 50) {
                    console.warn("Readability failed or returned insufficient content. Falling back to Gemini...");

                    const apiKey = localStorage.getItem('geminiApiKey');
                    if (!apiKey || apiKey.trim() === '') {
                        throw new Error("Local parsing failed, and no Gemini API key is available for AI fallback. Please provide a key.");
                    }

                    updateStatus('Local parse insufficient. Falling back to AI model...', 'info');
                    articleData = await callGeminiForUrl(html, url);
                }
            }

            if (mode === 'pdf') {
                updateStatus('Formatting PDF...', 'info');
                await generatePdf(articleData);
            } else if (mode === 'native') {
                updateStatus('Opening Reading Mode...', 'info');
                showReadingMode(articleData);
            }

            saveToHistory(articleData.title, url);
            loadHistory();

        } catch (error) {
            console.error('URL Conversion Error:', error);
            updateStatus(`Error: ${error.message}`, 'error');
        } finally {
            toggleLoading(false);
        }
    }

    async function handlePdfConversion(file) {
        toggleLoading(true);
        try {
            updateStatus('Reading PDF file...', 'info');
            const arrayBuffer = await file.arrayBuffer();
            const typedarray = new Uint8Array(arrayBuffer);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;

            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n\n';
            }

            updateStatus('Asking AI model to format text...', 'info');
            const articleData = await callGeminiForPdfText(fullText, file.name);

            updateStatus('Formatting PDF...', 'info');
            await generatePdf(articleData);

        } catch (error) {
            console.error('PDF Conversion Error:', error);
            updateStatus(`Error: ${error.message}`, 'error');
        } finally {
            toggleLoading(false);
            pdfUploadInput.value = '';
            fileNameDisplay.classList.add('hidden');
        }
    }

    // --- READING MODE LOGIC ---
    function showReadingMode(articleData) {
        currentReadingArticleData = articleData;

        let safeHtml = DOMPurify.sanitize(articleData.articleBodyHtml);

        newspaperContent.innerHTML = `
            <h1>${articleData.title || 'Untitled Article'}</h1>
            ${articleData.author || articleData.publicationName || articleData.publicationDate ?
                `<div style="column-span: all; text-align: center; font-style: italic; color: var(--clr-text-muted); margin-bottom: 2rem;">
                    ${[articleData.author, articleData.publicationName, articleData.publicationDate].filter(Boolean).join(' | ')}
                </div>` : ''
            }
            ${articleData.featureImageUrl ?
                `<img src="${articleData.featureImageUrl}" alt="Feature Image" style="column-span: all; margin-bottom: 2rem; width: 100%; border-radius: var(--radius-md);">` : ''
            }
            ${safeHtml}
        `;

        // Swap Views
        homeView.classList.add('hidden');
        readingView.classList.remove('hidden');
        window.scrollTo(0, 0);
    }

    // --- HISTORY MANAGEMENT ---
    function getHistory() {
        return JSON.parse(localStorage.getItem('remarkableHistory') || '[]');
    }

    function saveToHistory(title, url) {
        let history = getHistory();
        history = history.filter(item => item.url !== url);
        history.unshift({ title: title || 'Untitled Article', url });
        if (history.length > 20) history.pop();
        localStorage.setItem('remarkableHistory', JSON.stringify(history));
    }

    function loadHistory() {
        const history = getHistory();
        if (history.length > 0) {
            historySection.classList.remove('hidden');
            historyList.innerHTML = '';
            history.forEach(item => {
                const div = document.createElement('div');
                div.className = 'history-item';
                div.innerHTML = `<span>${item.title}</span>`;
                div.onclick = () => {
                    urlInput.value = item.url;
                    urlInput.dispatchEvent(new Event('input'));
                    pdfUploadInput.value = '';
                    fileNameDisplay.classList.add('hidden');
                    startConversion();
                };
                historyList.appendChild(div);
            });
        } else {
            historySection.classList.add('hidden');
        }
    }

    function clearHistory() {
        localStorage.removeItem('remarkableHistory');
        loadHistory();
    }

    // --- DATE FORMATTING ---
    function getFormattedDate(dateString) {
        if (!dateString) return '';
        const sanitizedDateString = dateString.replace(/(\d+)(st|nd|rd|th)/, "$1");
        const datePart = new Date(sanitizedDateString);
        if (!isNaN(datePart.getTime())) {
            return `${String(datePart.getUTCMonth() + 1).padStart(2, '0')}/${String(datePart.getUTCDate()).padStart(2, '0')}/${datePart.getUTCFullYear()}`;
        }
        return '';
    }

    // --- PDFKIT IMPLEMENTATION (Stubbed out internals for now, leaving main signature) ---
    // Full generation logic remains the same.
    async function generatePdf(article) {
        updateStatus('Initializing PDF document...', 'info');

        const doc = new PDFDocument({
            bufferPages: true,
            autoFirstPage: false
        });
        const stream = doc.pipe(blobStream());

        try {
            updateStatus('Registering fonts...', 'info');
            doc.registerFont('BodyFont', 'Times-Roman');
            doc.registerFont('TitleFont', 'Helvetica-Bold');
            doc.registerFont('ItalicFont', 'Times-Italic');
            doc.registerFont('BoldFont', 'Times-Bold');
            doc.registerFont('BoldItalicFont', 'Times-BoldItalic');

            // --- PRE-FETCH IMAGE TO AVOID DUPLICATE HITS ---
            if (article.featureImageUrl) {
                try {
                    updateStatus('Pre-fetching feature image...', 'info');
                    const proxyImageUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(article.featureImageUrl)}`;
                    const imageResponse = await fetch(proxyImageUrl);
                    if (imageResponse.ok) {
                        let imageBuffer = await imageResponse.arrayBuffer();
                        if (article.featureImageUrl.toLowerCase().endsWith('.webp')) {
                            updateStatus('Converting WebP image...', 'info');
                            imageBuffer = await convertWebPToJpeg(imageBuffer);
                        }
                        article._rawImageBuffer = imageBuffer;
                    }
                } catch (imgError) {
                    console.warn(`Could not pre-fetch feature image. Error: ${imgError.message}`);
                }
            }

            await renderIndexPage(doc, article);
            await renderArticleForDevice(doc, article, DEVICE_PROFILES.PRO_MOVE);
            await renderArticleForDevice(doc, article, DEVICE_PROFILES.PRO);

            updateStatus('Finalizing PDF...', 'info');
            doc.end();
            stream.on('finish', function () {
                const url = stream.toBlobURL('application/pdf');
                const a = document.createElement('a');

                const safeFilename = sanitizeFilename(article.title);

                a.href = url;
                a.download = `${safeFilename}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
                updateStatus('Conversion complete!', 'success');
            });

        } catch (error) {
            console.error("PDF Generation Error:", error);
            updateStatus(`Error generating PDF: ${error.message}`, 'error');
        }
    }

    async function renderIndexPage(doc, article) {
        // Implementation from original code
        doc.addPage({ size: DEVICE_PROFILES.PRO.format, margins: DEVICE_PROFILES.PRO.margins });

        const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
        let titleBlockHeight = 0;
        const textWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        // Roughly estimate image height if present
        if (article.featureImageUrl) {
            titleBlockHeight += 300 + 40; // image + padding
        }

        titleBlockHeight += doc.font('TitleFont').fontSize(42).heightOfString(article.title || 'Untitled', { width: textWidth });
        titleBlockHeight += 20;

        if (article.author && article.author.toLowerCase() !== 'null') {
            titleBlockHeight += doc.font('TitleFont').fontSize(28).heightOfString(article.author, { width: textWidth });
        }
        const formattedDate = getFormattedDate(article.publicationDate);
        const bylineParts = [article.publicationName, formattedDate].filter(Boolean);
        if (bylineParts.length > 0) {
            titleBlockHeight += doc.font('BodyFont').fontSize(22).heightOfString(bylineParts.join(' - '), { width: textWidth });
        }

        const startY = doc.page.margins.top + (pageHeight / 2) - (titleBlockHeight / 2) - 150;
        doc.y = startY;

        doc.font('TitleFont').fontSize(42).fillColor('black').text(article.title || 'Untitled', { align: 'center' });
        doc.moveDown(1);
        if (article.author && article.author.toLowerCase() !== 'null') {
            doc.font('TitleFont').fontSize(28).text(article.author, { align: 'center' });
        }
        if (bylineParts.length > 0) {
            doc.font('BodyFont').fontSize(22).text(bylineParts.join(' - '), { align: 'center' });
        }
        doc.moveDown(2);

        // Image
        if (article._rawImageBuffer) {
            try {
                updateStatus('Embedding image on index...', 'info');
                doc.image(article._rawImageBuffer, {
                    fit: [doc.page.width - doc.page.margins.left - doc.page.margins.right, 300],
                    align: 'center'
                });
                doc.moveDown(2);
            } catch (imgError) {
                console.warn(`Could not load feature image on index. Error: ${imgError.message}`);
            }
        }

        const iconWidth = 120;
        const iconHeight = 160;
        const iconSpacing = 80;
        const totalIconWidth = (iconWidth * 2) + iconSpacing;
        const startX = (doc.page.width / 2) - (totalIconWidth / 2);

        const iconLayout = {
            proMove: { x: startX, y: doc.y + 40, width: iconWidth, height: iconHeight },
            pro: { x: startX + iconWidth + iconSpacing, y: doc.y + 40, width: iconWidth, height: iconHeight }
        };

        function drawTabletIcon(x, y, w, h, label, destinationName) {
            doc.roundedRect(x, y, w, h, 8).lineWidth(2).strokeColor('#333333').stroke();
            doc.rect(x + 6, y + 12, w - 12, h - 24).lineWidth(1).strokeColor('#999999').stroke();
            doc.circle(x + w / 2, y + h - 6, 2).fillColor('#333333').fill();
            doc.font('TitleFont').fontSize(12).fillColor('#333333').text(label, x, y + h / 2 - 6, { align: 'center', width: w });
            doc.fillColor('black'); // Reset

            // Make the entire icon clickable to jump to the respective section
            doc.goTo(x, y, w, h, destinationName);
        }

        drawTabletIcon(iconLayout.proMove.x, iconLayout.proMove.y, iconLayout.proMove.width, iconLayout.proMove.height, "Paper Pro Move", 'proMoveStart');
        drawTabletIcon(iconLayout.pro.x, iconLayout.pro.y, iconLayout.pro.width, iconLayout.pro.height, "Paper Pro", 'proStart');
    }

    async function renderArticleForDevice(doc, article, deviceProfile) {
        // Implementation from original code
        doc.options.size = deviceProfile.format;
        doc.options.margins = deviceProfile.margins;

        doc.addPage();

        if (deviceProfile.name === DEVICE_PROFILES.PRO_MOVE.name) {
            doc.addNamedDestination('proMoveStart');
        } else if (deviceProfile.name === DEVICE_PROFILES.PRO.name) {
            doc.addNamedDestination('proStart');
        }

        doc.fillColor('black');

        // Render title
        doc.font('TitleFont').fontSize(32).text(article.title || 'Untitled', {
            align: 'left',
            width: doc.page.width - doc.page.margins.left - doc.page.margins.right
        });
        doc.moveDown(1);

        if (article.author && article.author.toLowerCase() !== 'null') {
            doc.font('TitleFont').fontSize(20).text(article.author);
        }
        const formattedDate = getFormattedDate(article.publicationDate);
        const bylineParts = [article.publicationName, formattedDate].filter(Boolean);
        if (bylineParts.length > 0) {
            doc.font('BodyFont').fontSize(16).text(bylineParts.join(' - '));
        }
        doc.moveDown(2);

        if (article._rawImageBuffer) {
            try {
                updateStatus('Embedding image...', 'info');

                // Align left for Paper Pro, center for Pro Move
                const alignment = deviceProfile.name === DEVICE_PROFILES.PRO.name ? 'left' : 'center';

                let finalImageBuffer = article._rawImageBuffer;

                if (deviceProfile.name === DEVICE_PROFILES.PRO.name || deviceProfile.name === DEVICE_PROFILES.PRO_MOVE.name) {
                    updateStatus('Optimizing image for Paper Pro colors...', 'info');
                    finalImageBuffer = await processImageForPaperPro(article._rawImageBuffer);
                }

                doc.image(finalImageBuffer, {
                    fit: [doc.page.width - doc.page.margins.left - doc.page.margins.right, 300],
                    align: alignment
                });
                doc.moveDown(2);
            } catch (imgError) {
                console.warn(`Could not embed feature image. Error: ${imgError.message}`);
            }
        }

        if (article.articleBodyHtml) {
            renderHtmlInPdfKit(doc, article.articleBodyHtml, deviceProfile);
        } else {
            console.warn("articleBodyHtml is missing. Skipping render.");
            doc.font('BodyFont').fontSize(deviceProfile.fontSize).text("Could not parse article body.", { align: 'left' });
        }
    }

    function renderHtmlInPdfKit(doc, htmlString, deviceProfile) {
        // Implementation from original code
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;

        const lineGap = (deviceProfile.fontSize * deviceProfile.lineHeight) - deviceProfile.fontSize;
        const baseOptions = {
            align: 'left',
            lineGap: lineGap
        };

        Array.from(tempDiv.childNodes).forEach(node => {
            try {
                if (node.nodeType !== Node.ELEMENT_NODE && node.textContent.trim() === '') return;
                if (node.nodeType === Node.TEXT_NODE) {
                    doc.font('BodyFont').fontSize(deviceProfile.fontSize).text(node.textContent.trim(), { ...baseOptions, underline: false });
                    return;
                }

                const tagName = node.tagName.toLowerCase();

                if (['hr'].includes(tagName)) {
                    doc.moveDown(1);
                    doc.strokeColor('black').lineWidth(0.5).moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
                    doc.moveDown(1);
                    return;
                }

                if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div'].includes(tagName)) {
                    const childNodes = Array.from(node.childNodes);
                    if (childNodes.length === 0 && node.textContent.trim() === '') return;

                    for (let i = 0; i < childNodes.length; i++) {
                        const child = childNodes[i];
                        const isLastChild = i === childNodes.length - 1;
                        const options = { ...baseOptions, continued: !isLastChild };

                        let text = child.textContent;

                        if (child.nodeType === Node.TEXT_NODE) {
                            doc.font('BodyFont').fontSize(deviceProfile.fontSize).text(text, { ...options, underline: false, link: null });
                        } else if (child.nodeType === Node.ELEMENT_NODE) {
                            const childTagName = child.tagName.toLowerCase();
                            const isBold = childTagName === 'b' || childTagName === 'strong';
                            const isItalic = childTagName === 'i' || childTagName === 'em';

                            let font = 'BodyFont';
                            if (isBold && isItalic) font = 'BoldItalicFont';
                            else if (isBold) font = 'BoldFont';
                            else if (isItalic) font = 'ItalicFont';

                            const link = child.getAttribute('href');
                            if (link) {
                                doc.font(font).fontSize(deviceProfile.fontSize).fillColor('blue').text(text, { ...options, link: link, underline: true });
                                doc.fillColor('black'); // Reset color
                            } else {
                                doc.font(font).fontSize(deviceProfile.fontSize).text(text, { ...options, underline: false, link: null });
                            }
                        }
                    }
                    doc.moveDown(0.75);

                } else if (tagName === 'ul' || tagName === 'ol') {
                    const isOrdered = tagName === 'ol';
                    const items = Array.from(node.querySelectorAll('li')).map(li => li.textContent.trim()).filter(Boolean);
                    if (items.length > 0) {
                        doc.font('BodyFont').fontSize(deviceProfile.fontSize).list(items, {
                            ...baseOptions,
                            bulletRadius: 2.5,
                            indent: 20,
                            bulletIndent: isOrdered ? 0 : 20,
                            numbered: isOrdered
                        });
                        doc.moveDown(0.75);
                    }
                } else if (tagName === 'blockquote') {
                    doc.font('ItalicFont').fontSize(deviceProfile.fontSize).text(`"${node.textContent.trim()}"`, { ...baseOptions, indent: 20 });
                    doc.moveDown(0.75);
                }
            } catch (e) {
                console.warn("Skipping unrenderable HTML node:", node, e);
            }
        });
    }

    // --- READABILITY API CALLS ---
    async function extractWithReadability(htmlString, sourceUrl) {
        return new Promise((resolve, reject) => {
            try {
                // Parse HTML string into DOM
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlString, 'text/html');

                // Readability heavily relies on absolute URIs to fetch images. Adjust base.
                const base = document.createElement('base');
                base.href = sourceUrl;
                doc.head.appendChild(base);

                // Initialize readability (will alter the passed document, but it's a temp virtual DOM)
                const reader = new Readability(doc);
                const article = reader.parse();

                if (!article) {
                    throw new Error("Readability could not parse the document.");
                }

                // Map Readability response back to our expected JSON schema
                const articleData = {
                    title: article.title || "Unknown Title",
                    author: article.byline || null,
                    publicationName: article.siteName || null,
                    publicationDate: null, // Readability rarely hits this accurately, usually needs meta tag parsing
                    featureImageUrl: null, // Will try to glean from head
                    articleBodyHtml: article.content
                };

                // Readability drops the meta tags. Try to salvage a feature image from the original DOM head
                const ogImage = doc.querySelector('meta[property="og:image"]');
                if (ogImage && ogImage.content) {
                    articleData.featureImageUrl = ogImage.content;
                }

                resolve(articleData);
            } catch (err) {
                reject(err);
            }
        });
    }

    // --- GEMINI API CALLS ---
    async function callGeminiForUrl(rawHtml, originalUrl) {
        // Pre-process HTML to massively reduce token payload and speed up Gemini TTFT
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, 'text/html');

        // Strip out non-content heavy nodes
        const elementsToRemove = doc.querySelectorAll('script, style, svg, nav, footer, aside, noscript, iframe, path, symbol');
        elementsToRemove.forEach(el => el.remove());

        const cleanedHtml = doc.body ? doc.body.innerHTML : rawHtml;

        const systemPrompt = `You are an expert web content extraction agent. Your task is to analyze the provided HTML of a web article and return a clean, structured JSON object. 
        The JSON object must contain: the main title, author's name, publication date, the publication's name (e.g., 'The New York Times'), the URL of the main feature image, and the complete, unabridged body of the article in clean HTML format.
        CRITICAL INSTRUCTIONS:
        1.  'articleBodyHtml': You MUST return the ENTIRE text of the article, from the first word to the very last. Do not summarize, shorten, or truncate the content in any way.
        2.  'publicationName': Extract the name of the website or publication.
        3.  'featureImageUrl': Ensure the image URL is absolute.
        4.  'articleBodyHtml': You MUST OMIT the main feature image from the HTML body, as it will be handled separately.
        5.  Exclude all non-essential elements: navigation, headers, footers, ads, social media, comments, and related article links.
        6.  Sanitize the HTML, preserving only basic formatting: <p>, <b>, <strong>, <i>, <em>, <ul>, <ol>, <li>, <blockquote>, <h1>-<h6> for subheadings, <a> for links, and <hr> for horizontal rules.
        7.  Ensure all image URLs within the article body are absolute (though typically you will remove them).`;

        const payload = {
            contents: [{ parts: [{ text: `Original URL: ${originalUrl}\n\nHTML:\n${cleanedHtml}` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "title": { "type": "STRING" },
                        "author": { "type": "STRING" },
                        "publicationDate": { "type": "STRING" },
                        "publicationName": { "type": "STRING" },
                        "featureImageUrl": { "type": "STRING" },
                        "articleBodyHtml": { "type": "STRING" }
                    },
                    required: ["title", "articleBodyHtml"]
                }
            }
        };
        return await makeGeminiRequest(payload);
    }

    async function callGeminiForPdfText(rawText, originalFilename) {
        // Implementation from original code
        const systemPrompt = `You are an expert text formatting agent. You will be given raw, unstructured text extracted from a PDF. Your task is to analyze the text and return a clean, structured JSON object.
        The JSON object must contain: a 'title' (which you should infer from the text, or use the original filename as a fallback), and the 'articleBodyHtml' which is the full body of the text formatted into clean HTML with <p> tags for paragraphs.
        CRITICAL INSTRUCTIONS:
        1. Reconstruct the paragraphs from the raw text. The text may have erratic line breaks; your job is to create a readable, flowing article.
        2. Do not omit any text. The 'articleBodyHtml' must contain the complete, unabridged content.
        3. You may optionally include 'author' and 'publicationDate' if they can be clearly identified in the text.`;

        const payload = {
            contents: [{ parts: [{ text: `Original Filename: ${originalFilename}\n\nRaw Text:\n${rawText}` }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "title": { "type": "STRING" },
                        "author": { "type": "STRING" },
                        "publicationDate": { "type": "STRING" },
                        "articleBodyHtml": { "type": "STRING" }
                    },
                    required: ["title", "articleBodyHtml"]
                }
            }
        };
        return await makeGeminiRequest(payload);
    }

    async function makeGeminiRequest(payload) {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            throw new Error("Please enter your Gemini API key in the settings field.");
        }

        // Ensure it gets saved whenever a request is made
        localStorage.setItem('geminiApiKey', apiKey);

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const response = await fetchWithBackoff(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            if (response.status === 401) {
                throw new Error(`API error: 401 Unauthorized. The environment's API key may be invalid or missing.`);
            }
            throw new Error(`API error: ${response.status} ${errorBody}`);
        }

        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jsonText) {
            throw new Error("AI model returned an empty or invalid response.");
        }

        try {
            return JSON.parse(jsonText);
        } catch (e) {
            console.error("Failed to parse AI model JSON:", jsonText);
            throw new Error("Received invalid JSON from the API.");
        }
    }

    // --- PWA SERVICE WORKER REGISTRATION ---
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js').then(registration => {
                    console.log('SW registered: ', registration.scope);
                }).catch(registrationError => {
                    console.log('SW registration failed: ', registrationError);
                });
            });
        }
    }
});
