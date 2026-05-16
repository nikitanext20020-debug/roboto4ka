"""Главная страница — три большие карточки + быстрые действия."""

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QFont
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QFrame, QLabel,
    QPushButton, QLineEdit,
)


def hero_card(num, title, desc, icon, on_click):
    card = QFrame()
    card.setProperty("class", "heroCard")
    card.setStyleSheet("background:#161A30;border:1px solid #26294A;border-radius:20px;")
    v = QVBoxLayout(card)
    v.setContentsMargins(22, 20, 22, 20)
    v.setSpacing(8)

    n = QLabel(num)
    n.setStyleSheet("color:#7C5CFF;font-size:54px;font-weight:900;")
    v.addWidget(n)

    t = QLabel(title)
    t.setStyleSheet("color:white;font-size:16px;font-weight:800;letter-spacing:1.2px;")
    v.addWidget(t)

    d = QLabel(desc)
    d.setStyleSheet("color:#7E84A3;font-size:12px;")
    d.setWordWrap(True)
    v.addWidget(d)

    # Иконка-плашка
    icon_box = QLabel(icon)
    icon_box.setAlignment(Qt.AlignCenter)
    icon_box.setMinimumHeight(120)
    icon_box.setStyleSheet(
        "background:qlineargradient(x1:0,y1:0,x2:1,y2:1,"
        "stop:0 #1D2240, stop:1 #261A45);"
        "border:1px solid #26294A;border-radius:14px;"
        "color:#7C5CFF;font-size:48px;"
    )
    v.addWidget(icon_box, 1)

    btn = QPushButton("Перейти  →")
    btn.setStyleSheet(
        "background:qlineargradient(x1:0,y1:0,x2:1,y2:0,"
        "stop:0 #7C5CFF, stop:1 #5B7BFF);"
        "color:white;border:none;border-radius:10px;"
        "padding:10px 16px;font-weight:700;font-size:12px;"
    )
    btn.clicked.connect(on_click)
    h = QHBoxLayout()
    h.addWidget(btn)
    h.addStretch(1)
    v.addLayout(h)
    return card


def action_tile(icon, title, subtitle, on_click):
    b = QPushButton()
    b.setProperty("class", "actionTile")
    b.setCursor(Qt.PointingHandCursor)
    b.setStyleSheet(
        "QPushButton { background:#1D2240;border:1px solid #26294A;"
        "border-radius:14px;text-align:left;padding:0; }"
        "QPushButton:hover { border-color:#7C5CFF; background:#161A30; }"
    )
    lay = QHBoxLayout(b)
    lay.setContentsMargins(14, 12, 14, 12)
    lay.setSpacing(12)

    ic = QLabel(icon)
    ic.setFixedSize(38, 38)
    ic.setAlignment(Qt.AlignCenter)
    ic.setStyleSheet(
        "background:qlineargradient(x1:0,y1:0,x2:1,y2:1,"
        "stop:0 #7C5CFF, stop:1 #5B7BFF);"
        "border-radius:10px;color:white;font-size:18px;"
    )
    lay.addWidget(ic)

    text_v = QVBoxLayout()
    text_v.setSpacing(2)
    t = QLabel(title)
    t.setStyleSheet("color:white;font-size:13px;font-weight:700;background:transparent;border:none;")
    s = QLabel(subtitle)
    s.setStyleSheet("color:#7E84A3;font-size:11px;background:transparent;border:none;")
    text_v.addWidget(t)
    text_v.addWidget(s)
    lay.addLayout(text_v, 1)

    b.clicked.connect(on_click)
    return b


class HomePage(QWidget):
    def __init__(self, app):
        super().__init__()
        self.app = app
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(28, 22, 28, 22)
        root.setSpacing(14)

        # ==== Шапка ====
        head = QHBoxLayout()
        head.setSpacing(16)
        welcome_v = QVBoxLayout()
        welcome_v.setSpacing(2)
        hi = QLabel("Добро пожаловать,")
        hi.setStyleSheet("color:#7E84A3;font-size:13px;")
        name = QLabel("Офисный планктон  👋")
        name.setStyleSheet("color:white;font-size:26px;font-weight:800;")
        welcome_v.addWidget(hi)
        welcome_v.addWidget(name)
        head.addLayout(welcome_v)
        head.addStretch(1)

        # быстрый поиск
        quick = QLineEdit()
        quick.setPlaceholderText("🔎  Быстрый поиск...")
        quick.setMinimumWidth(360)
        quick.setMinimumHeight(44)
        quick.returnPressed.connect(lambda: self._quick_search(quick.text()))
        head.addWidget(quick)

        # уведомления
        bell = QPushButton("🔔")
        bell.setFixedSize(44, 44)
        bell.setStyleSheet(
            "background:#161A30;border:1px solid #26294A;border-radius:22px;"
            "color:white;font-size:16px;"
        )
        head.addWidget(bell)
        root.addLayout(head)

        # ==== 3 героя ====
        heroes = QHBoxLayout()
        heroes.setSpacing(14)
        heroes.addWidget(hero_card("01", "ПОИСК ПО БАЗЕ",
            "Находи нужную информацию мгновенно в нашей базе знаний",
            "🔎", lambda: self.app.go_to(1)))
        heroes.addWidget(hero_card("02", "ПРОВЕРКА ТЕКСТА",
            "Орфография, пунктуация, чистка лишних пробелов",
            "✍", lambda: self.app.go_to(2)))
        heroes.addWidget(hero_card("03", "РЕДАКТОР ФОТО И ВИДЕО",
            "Сжимай, обрезай и улучшай медиа как профессионал",
            "🖼", lambda: self.app.go_to(4)))
        root.addLayout(heroes, 1)

        # ==== Нижний ряд: быстрые действия и совет ====
        bottom = QHBoxLayout()
        bottom.setSpacing(14)

        # Быстрые действия
        qa = QFrame()
        qa.setProperty("class", "statCard")
        qa.setStyleSheet("background:#161A30;border:1px solid #26294A;border-radius:14px;")
        qv = QVBoxLayout(qa)
        qv.setContentsMargins(20, 16, 20, 16)
        qv.setSpacing(10)

        qh = QHBoxLayout()
        qt = QLabel("Быстрые действия")
        qt.setStyleSheet("color:white;font-size:14px;font-weight:700;")
        qh.addWidget(qt)
        qh.addStretch(1)
        qv.addLayout(qh)

        grid = QGridLayout()
        grid.setSpacing(10)
        grid.addWidget(action_tile("🔄", "Конвертировать", "файлы",
            lambda: self.app.go_to(3)), 0, 0)
        grid.addWidget(action_tile("📦", "Сжать", "PDF / Фото / Видео",
            lambda: self.app.go_to(4)), 0, 1)
        grid.addWidget(action_tile("📋", "Найти ФИО", "по базе",
            lambda: self.app.go_to(1)), 1, 0)
        grid.addWidget(action_tile("✨", "Проверить", "орфографию",
            lambda: self.app.go_to(2)), 1, 1)
        qv.addLayout(grid)
        bottom.addWidget(qa, 1)

        # Совет дня
        tip = QFrame()
        tip.setObjectName("tipBar")
        tv = QVBoxLayout(tip)
        tv.setContentsMargins(20, 16, 20, 16)
        tv.setSpacing(6)
        tt = QLabel("⚡  Совет дня")
        tt.setStyleSheet("color:white;font-size:14px;font-weight:700;background:transparent;")
        td = QLabel(
            "Можешь искать сразу несколько человек: вставь ФИО или телефоны "
            "в массовый поиск — по одной строке. Поддерживаются Excel, CSV и Word."
        )
        td.setStyleSheet("color:#B6BDD8;font-size:12px;background:transparent;")
        td.setWordWrap(True)
        tv.addWidget(tt)
        tv.addWidget(td)
        tv.addStretch(1)
        bottom.addWidget(tip, 1)

        root.addLayout(bottom)

    def _quick_search(self, text):
        text = text.strip()
        if not text:
            return
        # Переходим на страницу поиска и заполняем
        self.app.go_to(1)
        page = self.app.search_page
        from .utils import is_phone_query
        if is_phone_query(text):
            page.phone_edit.setText(text)
        else:
            page.fio_edit.setText(text)
        page.on_search()
