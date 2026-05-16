"""Страница: Редактор фото и видео через Cloudinary."""

import os
import requests
from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QFrame, QLabel, QPushButton,
    QComboBox, QLineEdit, QFileDialog, QMessageBox, QGridLayout,
)


class CloudinaryUpload(QThread):
    """Загружает файл и применяет трансформации через Cloudinary."""
    done = Signal(str, str, str)  # original_url, transformed_url, error
    progress = Signal(str)

    def __init__(self, cloud_name, api_key, api_secret, src_path, transformation):
        super().__init__()
        self.cloud_name = cloud_name
        self.api_key = api_key
        self.api_secret = api_secret
        self.src_path = src_path
        self.transformation = transformation  # строка типа "c_fill,w_800,h_600,q_auto"

    def run(self):
        try:
            import cloudinary
            import cloudinary.uploader
            import cloudinary.utils

            cloudinary.config(
                cloud_name=self.cloud_name,
                api_key=self.api_key,
                api_secret=self.api_secret,
                secure=True,
                api_proxy=None,
            )

            self.progress.emit("Загружаю в Cloudinary...")
            ext = os.path.splitext(self.src_path)[1].lower()
            resource_type = "video" if ext in (".mp4", ".mov", ".webm", ".avi", ".mkv") else "image"

            # Большой таймаут на крупные видео
            res = cloudinary.uploader.upload_large(
                self.src_path,
                resource_type=resource_type,
                folder="roboto4ka",
                chunk_size=6_000_000,
                timeout=600,
            ) if resource_type == "video" else cloudinary.uploader.upload(
                self.src_path,
                resource_type=resource_type,
                folder="roboto4ka",
                timeout=300,
            )
            original_url = res.get("secure_url", "")
            public_id = res.get("public_id", "")

            self.progress.emit("Применяю трансформации...")
            transformed_url, _ = cloudinary.utils.cloudinary_url(
                public_id,
                resource_type=resource_type,
                transformation=self.transformation if self.transformation else None,
                format=ext.lstrip(".") if ext else None,
            )
            self.done.emit(original_url, transformed_url, "")
        except Exception as e:
            self.done.emit("", "", str(e))


class DownloadThread(QThread):
    done = Signal(str, str)  # path, error

    def __init__(self, url, save_path):
        super().__init__()
        self.url = url
        self.save_path = save_path

    def run(self):
        try:
            r = requests.get(self.url, timeout=120, stream=True)
            r.raise_for_status()
            with open(self.save_path, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
            self.done.emit(self.save_path, "")
        except Exception as e:
            self.done.emit("", str(e))


class MediaPage(QWidget):
    def __init__(self, app):
        super().__init__()
        self.app = app
        self.src_path = ""
        self.transformed_url = ""
        self._upload_thread = None
        self._download_thread = None
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(28, 24, 28, 24)
        root.setSpacing(14)

        title = QLabel("Редактор фото и видео")
        title.setStyleSheet("font-size:24px;font-weight:700;color:white;")
        root.addWidget(title)

        # Выбор файла
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
        root.addWidget(pick)

        # Параметры
        params = QFrame()
        params.setStyleSheet("background:#171922;border:1px solid #2A2F3D;border-radius:14px;")
        gl = QGridLayout(params)
        gl.setContentsMargins(20, 16, 20, 16)
        gl.setHorizontalSpacing(12)
        gl.setVerticalSpacing(8)

        # пресеты
        gl.addWidget(QLabel("Пресет:"), 0, 0)
        self.preset_combo = QComboBox()
        self.preset_combo.addItems([
            "Авто-оптимизация",
            "Сжать (q_auto:low)",
            "Сжать сильно (q_30)",
            "Обрезать в 800×600 (fill)",
            "Обрезать в квадрат 600×600",
            "Уменьшить до 1280px (по ширине)",
            "Чёрно-белый",
            "Размытие фона",
            "Своя строка трансформаций",
        ])
        self.preset_combo.currentIndexChanged.connect(self._on_preset_changed)
        gl.addWidget(self.preset_combo, 0, 1, 1, 3)

        gl.addWidget(QLabel("Ширина:"), 1, 0)
        self.width_edit = QLineEdit()
        self.width_edit.setPlaceholderText("800")
        gl.addWidget(self.width_edit, 1, 1)
        gl.addWidget(QLabel("Высота:"), 1, 2)
        self.height_edit = QLineEdit()
        self.height_edit.setPlaceholderText("600")
        gl.addWidget(self.height_edit, 1, 3)

        gl.addWidget(QLabel("Cloudinary-трансформация:"), 2, 0)
        self.tr_edit = QLineEdit()
        self.tr_edit.setPlaceholderText("c_fill,w_800,h_600,q_auto")
        gl.addWidget(self.tr_edit, 2, 1, 1, 3)

        bb = QHBoxLayout()
        bb.addStretch(1)
        self.process_btn = QPushButton("Обработать")
        self.process_btn.setStyleSheet(
            "background:#7C5CFF;color:white;border:none;border-radius:10px;"
            "padding:10px 18px;font-weight:600;"
        )
        self.process_btn.clicked.connect(self.on_process)
        self.process_btn.setEnabled(False)
        bb.addWidget(self.process_btn)
        gl.addLayout(bb, 3, 0, 1, 4)

        root.addWidget(params)

        # Превью до/после
        prev_row = QHBoxLayout()
        prev_row.setSpacing(12)

        self.before_card, self.before_label = self._make_preview_card("До")
        self.after_card, self.after_label = self._make_preview_card("После")
        prev_row.addWidget(self.before_card, 1)
        prev_row.addWidget(self.after_card, 1)
        root.addLayout(prev_row, 1)

        # Низ: кнопка скачать результат
        bot = QHBoxLayout()
        bot.addStretch(1)
        self.save_btn = QPushButton("Сохранить результат")
        self.save_btn.setStyleSheet(
            "background:transparent;color:#E8EAF0;border:1px solid #2A2F3D;"
            "border-radius:10px;padding:8px 14px;"
        )
        self.save_btn.clicked.connect(self.on_save)
        self.save_btn.setEnabled(False)
        bot.addWidget(self.save_btn)
        root.addLayout(bot)

    def _make_preview_card(self, title):
        card = QFrame()
        card.setStyleSheet("background:#171922;border:1px solid #2A2F3D;border-radius:14px;")
        v = QVBoxLayout(card)
        v.setContentsMargins(16, 12, 16, 12)
        v.setSpacing(8)
        h = QLabel(title)
        h.setStyleSheet("font-size:13px;font-weight:600;color:white;")
        v.addWidget(h)
        lbl = QLabel("")
        lbl.setAlignment(Qt.AlignCenter)
        lbl.setMinimumHeight(280)
        lbl.setStyleSheet(
            "background:#0E0F14;border:1px dashed #2A2F3D;border-radius:10px;"
            "color:#8A92A6;font-size:13px;"
        )
        v.addWidget(lbl, 1)
        return card, lbl

    # --- пресеты ---
    def _on_preset_changed(self, idx):
        text = self.preset_combo.currentText()
        if text == "Авто-оптимизация":
            self.tr_edit.setText("q_auto,f_auto")
        elif text == "Сжать (q_auto:low)":
            self.tr_edit.setText("q_auto:low,f_auto")
        elif text == "Сжать сильно (q_30)":
            self.tr_edit.setText("q_30,f_auto")
        elif text == "Обрезать в 800×600 (fill)":
            self.tr_edit.setText("c_fill,w_800,h_600,q_auto")
            self.width_edit.setText("800")
            self.height_edit.setText("600")
        elif text == "Обрезать в квадрат 600×600":
            self.tr_edit.setText("c_fill,w_600,h_600,q_auto")
            self.width_edit.setText("600")
            self.height_edit.setText("600")
        elif text == "Уменьшить до 1280px (по ширине)":
            self.tr_edit.setText("c_limit,w_1280,q_auto")
            self.width_edit.setText("1280")
            self.height_edit.setText("")
        elif text == "Чёрно-белый":
            self.tr_edit.setText("e_grayscale,q_auto")
        elif text == "Размытие фона":
            self.tr_edit.setText("e_blur:600,q_auto")
        # своя строка — оставляем как есть

    def on_pick(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Выбери фото или видео", "",
            "Медиа (*.jpg *.jpeg *.png *.webp *.gif *.bmp *.mp4 *.mov *.webm)"
        )
        if not path:
            return
        self.src_path = path
        self.file_label.setText(os.path.basename(path))
        self.process_btn.setEnabled(True)
        self.save_btn.setEnabled(False)
        self._show_preview(self.before_label, path)
        self.after_label.setPixmap(QPixmap())
        self.after_label.setText("")

    def _show_preview(self, label, path_or_url):
        pix = QPixmap()
        if path_or_url.startswith("http"):
            try:
                r = requests.get(path_or_url, timeout=30)
                r.raise_for_status()
                pix.loadFromData(r.content)
            except Exception:
                label.setText("Не удалось загрузить превью")
                return
        else:
            pix = QPixmap(path_or_url)

        if pix.isNull():
            label.setText("Превью недоступно (видео или неподдерживаемый формат)")
            return
        label.setPixmap(pix.scaled(640, 360, Qt.KeepAspectRatio, Qt.SmoothTransformation))

    def on_process(self):
        if not self.src_path:
            return
        cfg = self.app.config
        cloud = cfg.get("cloudinary_cloud_name", "")
        key = cfg.get("cloudinary_api_key", "")
        secret = cfg.get("cloudinary_api_secret", "")
        if not (cloud and key and secret):
            QMessageBox.warning(self, "Roboto4ka",
                "В config.json не указаны cloudinary_cloud_name / api_key / api_secret.")
            return

        # собираем трансформацию из своей строки или ширины/высоты
        tr = self.tr_edit.text().strip()
        if not tr:
            w = self.width_edit.text().strip()
            h = self.height_edit.text().strip()
            parts = ["q_auto"]
            if w and h:
                parts = [f"c_fill,w_{w},h_{h},q_auto"]
            elif w:
                parts = [f"c_limit,w_{w},q_auto"]
            tr = ",".join(parts) if isinstance(parts, list) else parts

        self.app.show_loading("Загрузка в облако...")
        self._upload_thread = CloudinaryUpload(cloud, key, secret, self.src_path, tr)
        self._upload_thread.progress.connect(lambda m: self.app.set_loading_text(m))
        self._upload_thread.done.connect(self._on_processed)
        self._upload_thread.start()

    def _on_processed(self, original_url, transformed_url, err):
        self.app.hide_loading()
        if err:
            QMessageBox.critical(self, "Roboto4ka", f"Ошибка обработки:\n{err}")
            return
        self.transformed_url = transformed_url
        self._show_preview(self.after_label, transformed_url)
        self.save_btn.setEnabled(True)

    def on_save(self):
        if not self.transformed_url:
            return
        ext = os.path.splitext(self.src_path)[1] or ".jpg"
        base = os.path.splitext(os.path.basename(self.src_path))[0]
        save_path, _ = QFileDialog.getSaveFileName(
            self, "Куда сохранить", f"{base}_edited{ext}",
            f"Файл (*{ext})"
        )
        if not save_path:
            return
        self.app.show_loading("Скачиваю результат...")
        self._download_thread = DownloadThread(self.transformed_url, save_path)
        self._download_thread.done.connect(self._on_downloaded)
        self._download_thread.start()

    def _on_downloaded(self, path, err):
        self.app.hide_loading()
        if err:
            QMessageBox.critical(self, "Roboto4ka", f"Ошибка скачивания:\n{err}")
            return
        QMessageBox.information(self, "Roboto4ka", f"Сохранено:\n{path}")
