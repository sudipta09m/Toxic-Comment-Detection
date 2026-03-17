# 🚀 Toxic Comment Detection (YouTube Extension)

## 📌 Overview

**Toxic Comment Detection** is a browser extension that automatically detects toxic comments on YouTube.
It uses a **Hugging Face Toxic BERT model** to analyze comments in real-time and classify them as **toxic** or **non-toxic**.

The extension enhances user experience by visually highlighting harmful content:

* 🔴 Toxic comments → marked in **red**
* 🟢 Non-toxic comments → marked in **green**

---

## 🎯 Features

* ✅ Real-time toxic comment detection on YouTube
* 🔄 Automatic scrolling to load all comments
* 🤖 Machine learning-based classification using Toxic BERT
* 🎨 Visual highlighting (red/green) for easy understanding
* ⚡ Lightweight browser extension UI
* 🔗 Backend integration using Flask

---

## 🧠 How It Works

1. The extension loads on a YouTube video page
2. Automatically scrolls to fetch all comments
3. Extracts comments and converts them into **JSON format**
4. Sends the data to the backend (Flask server)
5. The backend uses the **Hugging Face Toxic BERT model** for prediction
6. The result is returned to the extension
7. Comments are highlighted:

   * **Red** → Toxic
   * **Green** → Non-toxic

---

## 🛠️ Tech Stack

### 🔹 Frontend (Extension UI)

* HTML
* CSS
* JavaScript

### 🔹 Backend

* Python
* Flask

### 🔹 Machine Learning

* Hugging Face Transformers
* Toxic BERT Model

---

## 📁 Project Structure

```
project-root/
│
├── ex2/                    # Browser extension files
│   ├── manifest.json
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   ├── style.css
│
├── flask/                 # Backend server
│   ├── app.py
│   ├── model.py
│
├── .gitignore
└── README.md
```

---

## ⚙️ Installation & Setup

### 🔹 1. Clone the Repository

```bash
git clone https://github.com/your-username/Toxic-Comment-Detection.git
cd Toxic-Comment-Detection
```

---

### 🔹 2. Setup Backend (Flask)

```bash
cd flask
pip install -r requirements.txt
python app.py
```

---

### 🔹 3. Load Extension in Browser

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable **Developer Mode**
4. Click **Load unpacked**
5. Select the `ex2/` folder

---

## ▶️ Usage

1. Open any YouTube video
2. Activate the extension
3. The extension will:

   * Scroll through comments
   * Analyze them
   * Highlight toxic comments automatically

---

## 📸 Output

* 🔴 Toxic comments → highlighted in red
* 🟢 Safe comments → highlighted in green

---

## ⚠️ Notes

* Large number of comments may take time to process
* Model predictions depend on the pre-trained Hugging Face model
* Ensure Flask server is running before using the extension

---

## 🔮 Future Improvements

* 🔍 Support for multiple languages
* 📊 Toxicity score visualization
* ⚡ Faster batch processing
* 🌐 Deploy backend online (no local server needed)

---

## 👨‍💻 Author

Sudipta Mandal
