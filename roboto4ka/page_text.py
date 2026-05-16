"""Страница: Проверка текста на ошибки + чистка пробелов."""

import re
import requests
from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtGui import QTextCharFormat, QColor, QTextCursor
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QFrame, QLabel,
    QPushButton, QTextEdit, QMessageBox,
)


YASPELLER_URL = "https://speller.yandex.net/services/spellservice.json/checkText"


class SpellThread(QThread):
    done = Signal(list, str)  # mistakes, error

    def __init__(self, text):
        super().__init__()
        self.text = text

    def run(self):
        try:
            r = requests.post(
                YASPELLER_URL,
                data={"text": self.text, "lang": "ru,en", "options": 0},
                timeout=20,
            )
            r.raise_for_status()
            self.done.emit(r.json(), "")
        except Exception as e:
            self.done.emit([], str(e))


class TextPage(QWidget):
    def __init__(self, app):
        super().__init__()
        self.app = app
        self._thread = None
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(28, 24, 28, 24)
        root.setSpacing(14)

        title = QLabel("Проверка текста")
        title.setStyleSheet("font-size:24px;font-weight:700;color:white;")
        root.addWidget(title)

        # Карточка с инструментами
        tools = QFrame()
        tools.setObjectName("toolsCard")
        tools.setStyleSheet(
            "QFrame#toolsCard { background:#171922; border:1px solid #2A2F3D; border-radius:14px; }"
        )
        tl = QHBoxLayout(tools)
        tl.setContentsMargins(16, 12, 16, 12)
        tl.setSpacing(8)

        def chip(text, slot):
            b = QPushButton(text)
            b.setStyleSheet(
                "background:#1F222D;color:#E8EAF0;border:1px solid #2A2F3D;"
                "border-radius:16px;padding:6px 14px;font-size:12px;"
            )
            b.clicked.connect(slot)
            return b

        tl.addWidget(chip("Удалить лишние пробелы", self.on_trim_spaces))
        tl.addWidget(chip("Удалить лишние пробелы и пустые строки", self.on_trim_full))
        tl.addWidget(chip("Удалить все пробелы", self.on_remove_all_spaces))
        tl.addStretch(1)
        root.addWidget(tools)

        # Поле ввода
        self.editor = QTextEdit()
        self.editor.setPlaceholderText("Вставь сюда текст...")
        self.editor.textChanged.connect(self._update_counter)
        root.addWidget(self.editor, 1)

        # Низ: счётчик и кнопка проверки
        bar = QHBoxLayout()
        self.counter = QLabel("Символов: 0  ·  Слов: 0  ·  Строк: 0")
        self.counter.setStyleSheet("color:#8A92A6;font-size:12px;")
        bar.addWidget(self.counter)
        bar.addStretch(1)

        self.copy_btn = QPushButton("Скопировать")
        self.copy_btn.setStyleSheet(
            "background:transparent;color:#E8EAF0;border:1px solid #2A2F3D;"
            "border-radius:10px;padding:8px 14px;"
        )
        self.copy_btn.clicked.connect(self.on_copy)
        bar.addWidget(self.copy_btn)

        self.check_btn = QPushButton("Проверить орфографию")
        self.check_btn.setStyleSheet(
            "background:#7C5CFF;color:white;border:none;border-radius:10px;"
            "padding:10px 18px;font-weight:600;"
        )
        self.check_btn.clicked.connect(self.on_check)
        bar.addWidget(self.check_btn)
        root.addLayout(bar)

        # Карточка с результатами проверки
        self.result_card = QFrame()
        self.result_card.setObjectName("resCard")
        self.result_card.setStyleSheet(
            "QFrame#resCard { background:#171922; border:1px solid #2A2F3D; border-radius:14px; }"
        )
        rl = QVBoxLayout(self.result_card)
        rl.setContentsMargins(16, 12, 16, 12)
        rl.setSpacing(6)
        self.result_label = QLabel("Подсказки появятся здесь после проверки")
        self.result_label.setStyleSheet("color:#8A92A6;font-size:12px;")
        self.result_label.setWordWrap(True)
        rl.addWidget(self.result_label)
        root.addWidget(self.result_card)

    # ---- счётчик ----
    def _update_counter(self):
        text = self.editor.toPlainText()
        chars = len(text)
        words = len(re.findall(r"\b\w+\b", text, flags=re.UNICODE))
        lines = text.count("\n") + (1 if text else 0)
        self.counter.setText(f"Символов: {chars}  ·  Слов: {words}  ·  Строк: {lines}")

    # ---- чистка пробелов ----
    def on_trim_spaces(self):
        t = self.editor.toPlainText()
        t = re.sub(r"[ \t]+", " ", t)
        t = re.sub(r" *\n *", "\n", t)
        self.editor.setPlainText(t.strip())

    def on_trim_full(self):
        t = self.editor.toPlainText()
        t = re.sub(r"[ \t]+", " ", t)
        t = re.sub(r"\n\s*\n+", "\n", t)
        t = re.sub(r" *\n *", "\n", t)
        self.editor.setPlainText(t.strip())

    def on_remove_all_spaces(self):
        t = self.editor.toPlainText()
        t = re.sub(r"\s+", "", t)
        self.editor.setPlainText(t)

    # ---- копирование ----
    def on_copy(self):
        from PySide6.QtWidgets import QApplication
        QApplication.clipboard().setText(self.editor.toPlainText())
        self.app.set_status("Текст скопирован в буфер обмена")

    # ---- орфография ----
    def on_check(self):
        text = self.editor.toPlainText()
        if not text.strip():
            QMessageBox.information(self, "Roboto4ka", "Сначала вставь текст.")
            return
        self.app.show_loading("Проверяю орфографию...")
        self._thread = SpellThread(text)
        self._thread.done.connect(self._on_done)
        self._thread.start()

    def _on_done(self, mistakes, error):
        self.app.hide_loading()
        if error:
            QMessageBox.critical(self, "Roboto4ka", f"Ошибка сервиса:\n{error}")
            return
        self._highlight(mistakes)
        if not mistakes:
            self.result_label.setText("Ошибок не найдено.")
            self.result_label.setStyleSheet("color:#4ADE80;font-size:13px;")
            return
        lines = []
        for m in mistakes[:50]:
            word = m.get("word", "")
            suggestions = m.get("s", [])
            sug = ", ".join(suggestions[:5]) if suggestions else "—"
            lines.append(f"• {word}  →  {sug}")
        more = "" if len(mistakes) <= 50 else f"\n... и ещё {len(mistakes) - 50}"
        self.result_label.setText(f"Найдено {len(mistakes)} ошибок:\n" + "\n".join(lines) + more)
        self.result_label.setStyleSheet("color:#FF6B6B;font-size:13px;")

    def _highlight(self, mistakes):
        # Снимаем прежнюю подсветку
        cursor = self.editor.textCursor()
        cursor.select(QTextCursor.Document)
        normal = QTextCharFormat()
        normal.setBackground(QColor(0, 0, 0, 0))
        cursor.setCharFormat(normal)

        if not mistakes:
            return

        fmt = QTextCharFormat()
        fmt.setBackground(QColor("#3A1F2A"))
        fmt.setForeground(QColor("#FF8FA0"))

        for m in mistakes:
            pos = m.get("pos", -1)
            length = m.get("len", 0)
            if pos >= 0 and length > 0:
                c = self.editor.textCursor()
                c.setPosition(pos)
                c.setPosition(pos + length, QTextCursor.KeepAnchor)
                c.setCharFormat(fmt)
