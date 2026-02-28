# Read Later on reMarkable

A Progressive Web App (PWA) designed to elegantly convert web articles into perfectly formatted PDFs optimized for the **reMarkable Paper Pro** and **Pro Move** tablets. 

Say goodbye to cluttered web pages, distracting ads, and squished text. Send articles directly from your phone's browser straight to your reMarkable tablet in a beautiful, readable format.

## ✨ Features

- **Blazing Fast Extraction**: Uses Mozilla's `Readability.js` directly in your browser to instantly strip away ads, navigation bars, and popups, leaving only the pure content.
- **Detailed AI Fallback**: For complex websites where standard extraction fails, toggle the **Detailed (AI)** engine to have Google's Gemini AI reconstruct the article perfectly.
- **Native Android Sharing**: Install this PWA on your Android device (like a Pixel phone) and share articles directly from Chrome to the app via the native share sheet. 
- **Paper Pro Color Optimization**: Automatically intercepts article feature images and applies contrast and saturation boosts via HTML5 canvas to counteract the muted, dithering-heavy color profile of the Paper Pro display.
- **Offline Capable**: The core PWA interface is cached via Service Workers, allowing instant loading even on spotty connections.
- **Privacy First (BYOK)**: "Bring Your Own Key". Your Gemini API key is stored securely in your browser's local storage and never sent anywhere except directly to Google's servers.

## 🚀 Getting Started

This application is designed to be hosted entirely as a static client-side web application! You can host it instantly using **GitHub Pages**.

### 1. Host on GitHub Pages
1. Fork or clone this repository.
2. Go to your repository **Settings** > **Pages**.
3. Set the source branch to `main`.
4. Your application will be live at `https://[your-username].github.io/read-on-remarkable/`.

### 2. Install the PWA (Android / Pixel)
1. Navigate to your live GitHub Pages URL on your Android device using Chrome.
2. An "Add to Home Screen" prompt should appear. If not, tap the 3-dot menu and select **Install App**.
3. Once installed, you can share directly to the app from any other browser tab!

### 3. Setup Gemini AI (Optional)
If you want to use the "Detailed (AI)" fallback extraction:
1. Get a free API key from [Google AI Studio](https://aistudio.google.com/).
2. Open the PWA, expand the "Gemini API Key" section, and paste your key.
3. The app will securely remember it for all future uses.

## 🛠️ Technology Stack

*   **Frontend UI**: Pure Vanilla HTML/JS with custom CSS (Glassmorphism, gradients, micro-animations).
*   **Fonts**: *Covered By Your Grace* (Headings) and *Outfit* (Body).
*   **PDF Generation**: [PDFKit](https://pdfkit.org/) for precise layout control.
*   **Extraction Options**: 
    *   [Readability.js](https://github.com/mozilla/readability) (Fast/Default)
    *   Gemini 2.5 Flash API (Detailed/Fallback)
*   **CORS Bypassing**: [AllOrigins](https://allorigins.win/) proxy for fetching external HTML and Images.

## 📝 License

This project is open-source. Feel free to fork, modify, and improve!
