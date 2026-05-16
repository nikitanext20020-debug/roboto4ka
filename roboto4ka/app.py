"""Главное окно Roboto4ka."""

import os
import sys
from PySide6.QtCore import Qt
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QFrame, QLabel, QPushButton, QStackedWidget, QStatusBar, QButtonGroup,
)

from .theme import QSS
from .widgets import LoadingOverlay
from .utils import load_config, load_settings, save_settings, app_dir
from .page_home import HomePage
from .page_search import SearchPage
from .page_text import TextPage
from .page_convert import ConvertPage
from .page_media import MediaPage


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Roboto4ka — Create by Nikita")
        self.resize(1380, 880)
        self.config = load_config()
        self.settings = load_settings()

        self._build()

        # Авто-загрузка базы при старте
        last = self.settings.get("last_db")
        if last and os.path.exists(last):
            self.search_page.start_load(last)
        else:
            for name in ("backup.csv", "all_users.xlsx", "BAZA BY NIKITA.xlsx"):
                p = os.path.join(app_dir(), name)
                if os.path.exists(p):
                    self.search_page.start_load(p)
                    break

    def _build(self):
        root = QWidget()
        root.setObjectName("root")
        self.setCentralWidget(root)

        h = QHBoxLayout(root)
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(0)

        # ===== SIDEBAR =====
        side = QFrame()
        side.setObjectName("sidebar")
        side.setFixedWidth(252)
        sv = QVBoxLayout(side)
        sv.setContentsMargins(0, 18, 0, 18)
        sv.setSpacing(0)

        # Логотип-плашка
        logo_row = QHBoxLayout()
        logo_row.addStretch(1)
        logo = QLabel("R")
        logo.setObjectName("logoBox")
        logo.setFixedSize(74, 74)
        logo_row.addWidget(logo)
        logo_row.addStretch(1)
        sv.addLayout(logo_row)
        sv.addSpacing(12)

        brand = QLabel("ROBOTO4KA")
        brand.setObjectName("brand")
        sv.addWidget(brand)

        by = QLabel("CREATE BY")
        by.setObjectName("brandBy")
        sv.addWidget(by)

        nik = QLabel("NIKITA MISCHENKO")
        nik.setObjectName("brandBy")
        sv.addWidget(nik)
        sv.addSpacing(8)

        sub = QLabel("Специально\nдля офисных планктонов")
        sub.setObjectName("brandSub")
        sub.setAlignment(Qt.AlignCenter)
        sv.addWidget(sub)
        sv.addSpacing(20)

        # Навигация
        self.nav_group = QButtonGroup(self)
        self.nav_group.setExclusive(True)

        self.btn_home    = self._nav_btn("  🏠   Главная")
        self.btn_search  = self._nav_btn("  🔎   Поиск по базе")
        self.btn_text    = self._nav_btn("  ✍    Анализ текста")
        self.btn_convert = self._nav_btn("  🔄   Конвертер")
        self.btn_media   = self._nav_btn("  🖼   Редактор фото и видео")

        for i, b in enumerate((self.btn_home, self.btn_search, self.btn_text,
                               self.btn_convert, self.btn_media)):
            self.nav_group.addButton(b, i)
            sv.addWidget(b)
        self.btn_home.setChecked(True)

        sv.addStretch(1)

        # Профиль
        prof = QFrame()
        prof.setObjectName("profileCard")
        pl = QHBoxLayout(prof)
        pl.setContentsMargins(12, 10, 12, 10)
        pl.setSpacing(10)

        avatar = QLabel("НМ")
        avatar.setObjectName("avatar")
        avatar.setFixedSize(40, 40)
        pl.addWidget(avatar)

        pv = QVBoxLayout()
        pv.setSpacing(2)
        pn = QLabel("Никита Мищенко")
        pn.setObjectName("profileName")
        pr = QLabel("ПЛАНКТОН PRO")
        pr.setObjectName("profileRole")
        pv.addWidget(pn)
        pv.addWidget(pr)
        pl.addLayout(pv, 1)

        wrap = QHBoxLayout()
        wrap.setContentsMargins(14, 0, 14, 4)
        wrap.addWidget(prof)
        sv.addLayout(wrap)

        h.addWidget(side)

        # ===== CONTENT =====
        self.stack = QStackedWidget()
        self.home_page    = HomePage(self)
        self.search_page  = SearchPage(self)
        self.text_page    = TextPage(self)
        self.convert_page = ConvertPage(self)
        self.media_page   = MediaPage(self)

        for p in (self.home_page, self.search_page, self.text_page,
                  self.convert_page, self.media_page):
            self.stack.addWidget(p)

        h.addWidget(self.stack, 1)
        self.nav_group.idClicked.connect(self.stack.setCurrentIndex)

        # Статус-бар
        sb = QStatusBar()
        self.setStatusBar(sb)
        self.status_label = QLabel("Готово")
        sb.addWidget(self.status_label)

        self.setStyleSheet(QSS)

        # Оверлей
        self.overlay = LoadingOverlay(root)
        self.overlay.hide()

    def _nav_btn(self, text):
        b = QPushButton(text)
        b.setProperty("class", "navBtn")
        b.setCheckable(True)
        b.setCursor(Qt.PointingHandCursor)
        b.setMinimumHeight(42)
        return b

    # ---- API для страниц ----

    def go_to(self, idx):
        self.stack.setCurrentIndex(idx)
        btns = [self.btn_home, self.btn_search, self.btn_text,
                self.btn_convert, self.btn_media]
        for i, b in enumerate(btns):
            b.setChecked(i == idx)

    def show_loading(self, text="Загрузка..."):
        self.overlay.resize_to_parent()
        self.overlay.show_msg(text)
        QApplication.processEvents()

    def set_loading_text(self, text):
        self.overlay.label.setText(text)
        QApplication.processEvents()

    def hide_loading(self):
        self.overlay.hide_overlay()

    def set_status(self, text):
        self.status_label.setText(text)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if self.overlay.isVisible():
            self.overlay.resize_to_parent()


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("Roboto4ka")
    app.setStyle("Fusion")
    app.setFont(QFont("Segoe UI", 10))

    win = MainWindow()
    win.show()
    sys.exit(app.exec())
