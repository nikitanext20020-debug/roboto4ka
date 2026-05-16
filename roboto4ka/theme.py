"""Тёмная тема Roboto4ka — фиолетово-синий градиент, неоновые акценты."""

# Палитра
BG          = "#0B0D1A"      # глубокий синий фон
SIDEBAR_BG  = "#0E1124"
SURFACE     = "#161A30"
SURFACE_2   = "#1D2240"
BORDER      = "#26294A"
BORDER_2    = "#34386B"

ACCENT      = "#7C5CFF"      # основной фиолет
ACCENT_2    = "#5B7BFF"      # синий
NEON_PINK   = "#FF6BD3"
NEON_CYAN   = "#5EE7FF"
NEON_GREEN  = "#5BF0A1"

TEXT        = "#E8EAF8"
MUTED       = "#7E84A3"
DIM         = "#5A607F"
DANGER      = "#FF6B7A"
SUCCESS     = "#4ADE80"

QSS = f"""
* {{ font-family: 'Segoe UI Variable Display', 'Segoe UI', 'Inter', sans-serif; color: {TEXT}; }}
QMainWindow, QWidget#root {{ background: {BG}; }}

/* ========== SIDEBAR ========== */
QFrame#sidebar {{
    background: {SIDEBAR_BG};
    border-right: 1px solid {BORDER};
}}

QLabel#logoBox {{
    background: qlineargradient(x1:0,y1:0,x2:1,y2:1,
        stop:0 {ACCENT}, stop:1 {ACCENT_2});
    border-radius: 16px;
    color: white;
    font-size: 26px;
    font-weight: 800;
    qproperty-alignment: AlignCenter;
}}

QLabel#brand {{
    color: white; font-size: 19px; font-weight: 800;
    letter-spacing: 1.5px;
    qproperty-alignment: AlignCenter;
}}
QLabel#brandBy {{
    color: {ACCENT}; font-size: 10px; font-weight: 700;
    letter-spacing: 1.2px;
    qproperty-alignment: AlignCenter;
}}
QLabel#brandSub {{
    color: {MUTED}; font-size: 10px;
    qproperty-alignment: AlignCenter;
}}

QPushButton.navBtn {{
    background: transparent; color: {MUTED};
    text-align: left; padding: 11px 16px;
    border: none; border-radius: 12px;
    margin: 3px 14px; font-size: 13px;
    font-weight: 500;
}}
QPushButton.navBtn:hover {{
    background: {SURFACE_2}; color: white;
}}
QPushButton.navBtn:checked {{
    background: qlineargradient(x1:0,y1:0,x2:1,y2:0,
        stop:0 {ACCENT}, stop:1 {ACCENT_2});
    color: white; font-weight: 700;
}}

QFrame#profileCard {{
    background: {SURFACE};
    border: 1px solid {BORDER};
    border-radius: 14px;
}}
QLabel#avatar {{
    background: qlineargradient(x1:0,y1:0,x2:1,y2:1,
        stop:0 {NEON_PINK}, stop:1 {ACCENT});
    border-radius: 20px;
    color: white;
    font-size: 16px;
    font-weight: 700;
    qproperty-alignment: AlignCenter;
}}
QLabel#profileName {{ color: white; font-size: 13px; font-weight: 600; }}
QLabel#profileRole {{ color: {ACCENT}; font-size: 11px; font-weight: 700; letter-spacing: 1px; }}

/* ========== ОБЩЕЕ ========== */
QFrame.card, QFrame[class="card"] {{
    background: {SURFACE};
    border: 1px solid {BORDER};
    border-radius: 16px;
}}

QLabel.h1 {{ font-size: 28px; font-weight: 800; color: white; }}
QLabel.h2 {{ font-size: 14px; font-weight: 600; color: white; }}
QLabel.muted {{ color: {MUTED}; font-size: 12px; }}

/* ========== ВВОД ========== */
QLineEdit, QPlainTextEdit, QTextEdit, QComboBox {{
    background: {BG};
    border: 1px solid {BORDER};
    border-radius: 12px;
    padding: 11px 14px; color: {TEXT}; font-size: 13px;
    selection-background-color: {ACCENT};
}}
QLineEdit:focus, QPlainTextEdit:focus, QTextEdit:focus, QComboBox:focus {{
    border: 1px solid {ACCENT};
}}
QComboBox::drop-down {{ border: none; width: 24px; }}
QComboBox QAbstractItemView {{
    background: {SURFACE}; border: 1px solid {BORDER};
    selection-background-color: {ACCENT}; padding: 4px;
    outline: none;
}}

/* ========== КНОПКИ ========== */
QPushButton.primary {{
    background: qlineargradient(x1:0,y1:0,x2:1,y2:0,
        stop:0 {ACCENT}, stop:1 {ACCENT_2});
    color: white; border: none;
    border-radius: 12px; padding: 11px 22px;
    font-size: 13px; font-weight: 700;
}}
QPushButton.primary:hover {{
    background: qlineargradient(x1:0,y1:0,x2:1,y2:0,
        stop:0 #8E73FF, stop:1 #6E8AFF);
}}
QPushButton.primary:pressed {{
    background: qlineargradient(x1:0,y1:0,x2:1,y2:0,
        stop:0 #6849E5, stop:1 #4A6BE8);
}}
QPushButton.primary:disabled {{ background: #3A3550; color: #9590B0; }}

QPushButton.ghost {{
    background: transparent; color: {TEXT};
    border: 1px solid {BORDER_2};
    border-radius: 12px; padding: 11px 18px; font-size: 13px;
}}
QPushButton.ghost:hover {{ background: {SURFACE_2}; border-color: {ACCENT}; }}

QPushButton.chip {{
    background: {SURFACE_2}; color: {TEXT};
    border: 1px solid {BORDER}; border-radius: 18px;
    padding: 7px 16px; font-size: 12px;
}}
QPushButton.chip:hover {{ border-color: {ACCENT}; color: white; }}

/* ========== ТАБЛИЦА ========== */
QTableWidget {{
    background: {BG};
    border: 1px solid {BORDER}; border-radius: 12px;
    gridline-color: {SURFACE_2};
    selection-background-color: {ACCENT}; selection-color: white;
}}
QTableWidget::item {{ padding: 8px; border: none; }}
QHeaderView::section {{
    background: {SURFACE}; color: {MUTED}; border: none;
    border-right: 1px solid {BORDER}; border-bottom: 1px solid {BORDER};
    padding: 10px 8px; font-weight: 700; font-size: 11px;
    text-transform: uppercase;
}}

QStatusBar {{
    background: {SIDEBAR_BG}; color: {MUTED};
    border-top: 1px solid {BORDER};
}}

/* ========== СКРОЛЛБАРЫ ========== */
QScrollBar:vertical, QScrollBar:horizontal {{
    background: transparent; border: none; width: 10px; height: 10px; margin: 4px;
}}
QScrollBar::handle:vertical, QScrollBar::handle:horizontal {{
    background: {BORDER_2}; border-radius: 4px; min-height: 30px; min-width: 30px;
}}
QScrollBar::handle:hover {{ background: {ACCENT}; }}
QScrollBar::add-line, QScrollBar::sub-line {{ background: none; border: none; }}

/* ========== ОВЕРЛЕЙ ========== */
QFrame#loadingOverlay {{ background: rgba(11,13,26,0.75); }}
QLabel#loadingText {{ color: white; font-size: 14px; font-weight: 500; }}
QFrame#spinnerCard {{
    background: {SURFACE}; border: 1px solid {BORDER_2}; border-radius: 18px;
}}

/* ========== ГЛАВНАЯ ========== */
QFrame.heroCard {{
    background: {SURFACE};
    border: 1px solid {BORDER};
    border-radius: 20px;
}}
QLabel.heroNum {{
    color: {ACCENT};
    font-size: 56px; font-weight: 900;
    letter-spacing: -1px;
}}
QLabel.heroTitle {{
    color: white; font-size: 17px; font-weight: 800;
    letter-spacing: 1.2px;
}}
QLabel.heroDesc {{ color: {MUTED}; font-size: 12px; }}

QFrame.statCard {{
    background: {SURFACE};
    border: 1px solid {BORDER};
    border-radius: 14px;
}}

QFrame#tipBar {{
    background: qlineargradient(x1:0,y1:0,x2:1,y2:0,
        stop:0 #1B1F45, stop:1 #2A1B45);
    border: 1px solid {BORDER_2};
    border-radius: 14px;
}}

QPushButton.actionTile {{
    background: {SURFACE_2};
    border: 1px solid {BORDER};
    border-radius: 14px;
    padding: 14px;
    text-align: left;
    font-size: 12px;
    color: {TEXT};
}}
QPushButton.actionTile:hover {{
    border-color: {ACCENT};
    background: {SURFACE};
}}
"""
