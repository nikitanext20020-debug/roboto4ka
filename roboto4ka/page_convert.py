"""Страница: Конвертер файлов через ConvertHub API v2."""

import os
import time
import requests
from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QFrame, QLabel,
    QPushButton, QComboBox, QFileDialog, QMessageBox,
)


CONVERT_URL = "https://api.converthub.com/v2/convert"
JOB_URL = "https://api.converthub.com/v2/jobs/{}"

# Целевые форматы по исходнику
TARGETS_BY_EXT = {
    "pdf":  ["docx", "txt", "jpg", "png", "html", "epub"],
    "docx": ["pdf", "txt", "html", "odt", "epub"],
    "doc":  ["pdf", "docx", "txt", "html"],
    "txt":  ["pdf", "docx", "html"],
    "html": ["pdf", "docx", "txt", "png"],
    "htm":  ["pdf", "docx", "txt", "png"],
    "rtf":  ["pdf", "docx", "txt"],
    "odt":  ["pdf", "docx", "txt"],
    "epub": ["pdf", "docx", "txt", "mobi"],
    "jpg":  ["png", "pdf", "webp", "bmp", "gif", "tiff"],
    "jpeg": ["png", "pdf", "webp", "bmp", "gif", "tiff"],
    "png":  ["jpg", "pdf", "webp", "bmp", "gif", "tiff"],
    "webp": ["jpg", "png", "pdf"],
    "gif":  ["png", "jpg", "pdf"],
    "bmp":  ["jpg", "png", "pdf"],
    "tiff": ["jpg", "png", "pdf"],
    "svg":  ["png", "jpg", "pdf"],
    "mp3":  ["wav", "ogg", "flac", "m4a"],
    "wav":  ["mp3", "ogg", "flac"],
    "ogg":  ["mp3", "wav"],
    "mp4":  ["mov", "webm", "gif", "mp3"],
    "mov":  ["mp4", "webm"],
    "webm": ["mp4", "mov"],
    "xlsx": ["pdf", "csv", "html", "xls"],
    "xls":  ["xlsx", "pdf", "csv"],
    "pptx": ["pdf", "ppt", "png", "jpg"],
}


class ConvertThread(QThread):
    done = Signal(str, str)
    progress = Signal(str)

    def __init__(self, token, src_path, target_ext, save_path):
        super().__init__()
        self.token = token
        self.src_path = src_path
        self.target_ext = target_ext
        self.save_path = save_path

    def run(self):
        try:
            headers = {"Authorization": f"Bearer {self.token}"}

            # 1. Submit
            self.progress.emit("Загружаю файл на сервер...")
            with open(self.src_path, "rb") as f:
                up = requests.post(
                    CONVERT_URL,
                    headers=headers,
                    files={"file": (os.path.basename(self.src_path), f)},
                    data={"target_format": self.target_ext},
                    timeout=120,
                )
            if up.status_code >= 400:
                self.done.emit("", f"HTTP {up.status_code}: {up.text[:300]}")
                return

            payload = up.json()
            data = payload.get("data") or payload
            job_id = data.get("job_id") or data.get("id")
            if not job_id:
                self.done.emit("", f"Не получил job_id: {payload}")
                return

            # 2. Poll
            self.progress.emit("Конвертирую...")
            download_url = ""
            for i in range(120):  # до ~4 минут
                time.sleep(2)
                r = requests.get(JOB_URL.format(job_id), headers=headers, timeout=30)
                if r.status_code >= 400:
                    continue
                pj = r.json()
                d = pj.get("data") or pj
                status = d.get("status")
                progress = d.get("progress")
                if progress is not None:
                    self.progress.emit(f"Конвертирую... {progress}%")
                if status in ("completed", "success", "done"):
                    download_url = d.get("download_url") or d.get("url") or ""
                    if not download_url:
                        # fallback: api.converthub.com/v2/jobs/{id}/download
                        download_url = f"https://api.converthub.com/v2/jobs/{job_id}/download"
                    break
                if status in ("failed", "error"):
                    self.done.emit("", f"Ошибка задачи: {d.get('error', d)}")
                    return

            if not download_url:
                self.done.emit("", "Истекло время ожидания конвертации")
                return

            # 3. Download
            self.progress.emit("Скачиваю результат...")
            r = requests.get(download_url, headers=headers, timeout=180, stream=True)
            r.raise_for_status()
            with open(self.save_path, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
            self.done.emit(self.save_path, "")
        except Exception as e:
            self.done.emit("", str(e))


class ConvertPage(QWidget):
    def __init__(self, app):
        super().__init__()
        self.app = app
        self.src_path = ""
        self._thread = None
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(28, 24, 28, 24)
        root.setSpacing(14)

        title = QLabel("Конвертер файлов")
        title.setStyleSheet("font-size:24px;font-weight:700;color:white;")
        root.addWidget(title)

        pick = QFrame()
        pick.setStyleSheet("background:#171922;border:1px solid #2A2F3D;border-radius:14px;")
        pl = QHBoxLayout(pick)
        pl.setContentsMargins(20, 14, 20, 14)
        pl.setSpacing(12)

        self.pick_btn = QPushButton("Выбрать файл")
        self.pick_btn.setStyleSheet(
            "background:#7C5CFF;color:white;border:none;border-radius:10px;"
            "padding:10px 18px;font-weight:600;"
        )
        self.pick_btn.clicked.connect(self.on_pick)
        pl.addWidget(self.pick_btn)

        self.file_label = QLabel("Файл не выбран")
        self.file_label.setStyleSheet("color:#8A92A6;font-size:13px;")
        pl.addWidget(self.file_label, 1)

        pl.addWidget(QLabel("Формат:"))
        self.format_combo = QComboBox()
        self.format_combo.setMinimumWidth(160)
        pl.addWidget(self.format_combo)

        self.convert_btn = QPushButton("Конвертировать")
        self.convert_btn.setStyleSheet(
            "background:#7C5CFF;color:white;border:none;border-radius:10px;"
            "padding:10px 18px;font-weight:600;"
        )
        self.convert_btn.clicked.connect(self.on_convert)
        self.convert_btn.setEnabled(False)
        pl.addWidget(self.convert_btn)
        root.addWidget(pick)

        prev = QFrame()
        prev.setStyleSheet("background:#171922;border:1px solid #2A2F3D;border-radius:14px;")
        pv = QVBoxLayout(prev)
        pv.setContentsMargins(20, 14, 20, 14)
        pv.setSpacing(8)

        h = QLabel("Предпросмотр")
        h.setStyleSheet("font-size:14px;font-weight:600;color:white;")
        pv.addWidget(h)

        self.preview_label = QLabel("Здесь будет превью выбранного файла")
        self.preview_label.setAlignment(Qt.AlignCenter)
        self.preview_label.setMinimumHeight(280)
        self.preview_label.setStyleSheet(
            "background:#0E0F14;border:1px dashed #2A2F3D;border-radius:10px;"
            "color:#8A92A6;font-size:13px;"
        )
        pv.addWidget(self.preview_label, 1)

        self.meta_label = QLabel("")
        self.meta_label.setStyleSheet("color:#8A92A6;font-size:12px;")
        pv.addWidget(self.meta_label)
        root.addWidget(prev, 1)

    def on_pick(self):
        path, _ = QFileDialog.getOpenFileName(self, "Выбери файл", "", "Все файлы (*.*)")
        if not path:
            return
        self.src_path = path
        name = os.path.basename(path)
        size_kb = os.path.getsize(path) / 1024
        self.file_label.setText(name)

        ext = os.path.splitext(path)[1].lower().lstrip(".")
        targets = TARGETS_BY_EXT.get(ext, ["pdf", "txt", "png", "jpg"])
        self.format_combo.clear()
        self.format_combo.addItems(targets)
        self.convert_btn.setEnabled(True)

        self.meta_label.setText(f"Тип: .{ext}  ·  Размер: {size_kb:,.1f} KB".replace(",", " "))
        self._update_preview(path, ext)

    def _update_preview(self, path, ext):
        if ext in ("jpg", "jpeg", "png", "bmp", "gif", "webp"):
            pix = QPixmap(path)
            if not pix.isNull():
                self.preview_label.setPixmap(
                    pix.scaled(720, 380, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                )
                self.preview_label.setText("")
                return
        if ext in ("txt", "html", "htm", "csv", "json", "xml", "log", "md"):
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read(1500)
                self.preview_label.setPixmap(QPixmap())
                self.preview_label.setAlignment(Qt.AlignTop | Qt.AlignLeft)
                self.preview_label.setText(content if content.strip() else "(пусто)")
                self.preview_label.setStyleSheet(
                    "background:#0E0F14;border:1px solid #2A2F3D;border-radius:10px;"
                    "color:#E8EAF0;font-size:12px;padding:14px;font-family:Consolas;"
                )
                return
            except Exception:
                pass
        self.preview_label.setPixmap(QPixmap())
        self.preview_label.setAlignment(Qt.AlignCenter)
        self.preview_label.setText(f"📄  .{ext.upper()}\nПредпросмотр недоступен")
        self.preview_label.setStyleSheet(
            "background:#0E0F14;border:1px dashed #2A2F3D;border-radius:10px;"
            "color:#8A92A6;font-size:14px;"
        )

    def on_convert(self):
        if not self.src_path:
            return
        token = self.app.config.get("converthub_token", "")
        if not token:
            QMessageBox.warning(self, "Roboto4ka", "В config.json нет converthub_token.")
            return
        target = self.format_combo.currentText()
        base = os.path.splitext(os.path.basename(self.src_path))[0]
        save_path, _ = QFileDialog.getSaveFileName(
            self, "Куда сохранить", f"{base}.{target}", f"{target.upper()} (*.{target})"
        )
        if not save_path:
            return

        self.app.show_loading("Готовлю конвертацию...")
        self._thread = ConvertThread(token, self.src_path, target, save_path)
        self._thread.progress.connect(lambda m: self.app.set_loading_text(m))
        self._thread.done.connect(self._on_done)
        self._thread.start()

    def _on_done(self, saved, err):
        self.app.hide_loading()
        if err:
            QMessageBox.critical(self, "Roboto4ka", f"Ошибка конвертации:\n{err}")
            return
        QMessageBox.information(self, "Roboto4ka", f"Готово:\n{saved}")
