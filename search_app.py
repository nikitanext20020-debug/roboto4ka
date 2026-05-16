"""
Современный десктоп-поиск волонтёров на PySide6.
Запуск:  python search_app.py
Сборка:  pyinstaller --onefile --noconsole --name "PoiskVolonterov" search_app.py
"""

import os
import re
import sys
import json
import pandas as pd

from PySide6.QtCore import Qt, QThread, Signal, QSize
from PySide6.QtGui import QIcon, QFont, QAction
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QGridLayout,
    QLabel, QLineEdit, QPushButton, QPlainTextEdit, QTableWidget, QTableWidgetItem,
    QFileDialog, QMessageBox, QFrame, QStackedWidget, QHeaderView, QSizePolicy,
    QStatusBar, QAbstractItemView,
)

APP_TITLE = "Поиск волонтёров"
SETTINGS_FILE = "app_settings.json"


# ----------------- утилиты -----------------

def normalize_phone(s):
    digits = re.sub(r"\D", "", str(s or ""))
    if not digits:
        return ""
    if len(digits) == 11 and digits[0] in ("7", "8"):
        digits = digits[1:]
    if len(digits) >= 10:
        return digits[-10:]
    return digits


def normalize_fio(s):
    s = str(s or "").lower().replace("ё", "е").replace("-", " ")
    return re.sub(r"\s+", " ", s).strip()


def is_phone_query(s):
    return len(re.sub(r"\D", "", str(s or ""))) >= 10


def fmt_phone(d10):
    return "+7" + d10 if d10 and len(d10) == 10 else (d10 or "")


def fmt_date(s):
    s = str(s or "")
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        y, mo, d = m.groups()
        return f"{d}.{mo}.{y}"
    return s


def app_dir():
    return os.path.dirname(os.path.abspath(sys.argv[0]))


def load_settings():
    p = os.path.join(app_dir(), SETTINGS_FILE)
    if os.path.exists(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_settings(data):
    p = os.path.join(app_dir(), SETTINGS_FILE)
    try:
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


# ----------------- загрузка БД в потоке -----------------

class DbLoader(QThread):
    done = Signal(object, str)  # df, error
    progress = Signal(str)

    def __init__(self, path):
        super().__init__()
        self.path = path

    def run(self):
        try:
            self.progress.emit(f"Чтение {os.path.basename(self.path)}...")
            if self.path.lower().endswith(".csv"):
                df = pd.read_csv(self.path, dtype=str, keep_default_na=False)
            else:
                df = pd.read_excel(self.path, dtype=str)
                df = df.fillna("")

            self.progress.emit("Индексация...")
            last = df.get("last_name", pd.Series([""] * len(df))).astype(str)
            first = df.get("first_name", pd.Series([""] * len(df))).astype(str)
            patr = df.get("patronymic", pd.Series([""] * len(df))).astype(str)

            df["_fio_full"] = (last + " " + first + " " + patr).str.replace(r"\s+", " ", regex=True).str.strip()
            df["_fio_norm"] = df["_fio_full"].apply(normalize_fio)
            df["_fio_short"] = (last + " " + first).str.replace(r"\s+", " ", regex=True).str.strip().apply(normalize_fio)

            pm = df.get("phone_mobile", pd.Series([""] * len(df))).astype(str)
            pdi = df.get("phone_mobile_digits", pd.Series([""] * len(df))).astype(str)
            ph = df.get("phone_home", pd.Series([""] * len(df))).astype(str)
            df["_phone_norm"] = pm.where(pm != "", pdi).where(lambda x: x != "", ph).apply(normalize_phone)

            self.done.emit(df, "")
        except Exception as e:
            self.done.emit(None, str(e))


# ----------------- поиск -----------------

def search_one(df, query):
    q = query.strip()
    if not q:
        return df.iloc[0:0]
    if is_phone_query(q):
        return df[df["_phone_norm"] == normalize_phone(q)]
    qn = normalize_fio(q)
    exact = df[df["_fio_norm"] == qn]
    if len(exact):
        return exact
    parts = qn.split()
    if len(parts) == 2:
        sub = df[df["_fio_short"] == qn]
        if len(sub):
            return sub
    mask = pd.Series([True] * len(df), index=df.index)
    for p in parts:
        mask &= df["_fio_norm"].str.contains(re.escape(p), na=False)
    return df[mask]


def record_to_row(rec, query):
    return {
        "Запрос": query,
        "ФИО": rec.get("_fio_full", "") or "",
        "Телефон": fmt_phone(rec.get("_phone_norm", "") or ""),
        "Дата рождения": fmt_date(rec.get("birthday", "")),
        "Адрес": rec.get("address", "") or "",
        "Регион": rec.get("region_name", "") or "",
        "Отделение": rec.get("branch_name", "") or "",
        "Email": rec.get("email", "") or "",
        "Статус": rec.get("cfacbg", "") or "",
        "ID": rec.get("id", "") or "",
    }


# ----------------- стиль (QSS) -----------------

QSS = """
* { font-family: 'Segoe UI', 'Inter', sans-serif; color: #E6E8EE; }
QMainWindow, QWidget#root { background: #0F1115; }

/* Сайдбар */
QFrame#sidebar {
    background: #14171D;
    border: none;
}
QLabel#brand {
    color: #FFFFFF;
    font-size: 18px;
    font-weight: 600;
    padding: 18px 20px 10px 20px;
}
QLabel#brandSub { color: #7A8395; font-size: 11px; padding: 0 20px 16px 20px; }

QPushButton.navBtn {
    background: transparent;
    color: #B6BDCC;
    text-align: left;
    padding: 10px 18px;
    border: none;
    border-radius: 8px;
    margin: 2px 10px;
    font-size: 13px;
}
QPushButton.navBtn:hover { background: #1B2029; color: #FFFFFF; }
QPushButton.navBtn:checked { background: #2A6FF0; color: #FFFFFF; font-weight: 600; }

/* Карточки контента */
QFrame.card {
    background: #161A22;
    border: 1px solid #232836;
    border-radius: 14px;
}

QLabel.h1 { font-size: 22px; font-weight: 600; color: #FFFFFF; }
QLabel.h2 { font-size: 14px; font-weight: 600; color: #FFFFFF; }
QLabel.muted { color: #7A8395; font-size: 12px; }

/* Поля ввода */
QLineEdit, QPlainTextEdit {
    background: #0F1218;
    border: 1px solid #2A3040;
    border-radius: 10px;
    padding: 10px 12px;
    color: #E6E8EE;
    font-size: 13px;
    selection-background-color: #2A6FF0;
}
QLineEdit:focus, QPlainTextEdit:focus { border: 1px solid #2A6FF0; }

/* Кнопки */
QPushButton.primary {
    background: #2A6FF0;
    color: white;
    border: none;
    border-radius: 10px;
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 600;
}
QPushButton.primary:hover { background: #3A7DFF; }
QPushButton.primary:pressed { background: #1F5BCC; }

QPushButton.ghost {
    background: transparent;
    color: #B6BDCC;
    border: 1px solid #2A3040;
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 13px;
}
QPushButton.ghost:hover { background: #1B2029; color: #FFFFFF; }

/* Таблица */
QTableWidget {
    background: #0F1218;
    border: 1px solid #232836;
    border-radius: 12px;
    gridline-color: #1F2532;
    selection-background-color: #2A6FF0;
    selection-color: white;
}
QTableWidget::item { padding: 6px; border: none; }
QTableWidget::item:selected { background: #2A6FF0; color: white; }
QHeaderView::section {
    background: #14171D;
    color: #B6BDCC;
    border: none;
    border-right: 1px solid #232836;
    border-bottom: 1px solid #232836;
    padding: 10px 8px;
    font-weight: 600;
    font-size: 12px;
}

QStatusBar { background: #14171D; color: #7A8395; border-top: 1px solid #232836; }

/* Скроллбары */
QScrollBar:vertical, QScrollBar:horizontal {
    background: transparent; border: none; width: 10px; height: 10px; margin: 4px;
}
QScrollBar::handle:vertical, QScrollBar::handle:horizontal {
    background: #2A3040; border-radius: 4px; min-height: 30px; min-width: 30px;
}
QScrollBar::handle:hover { background: #3A4258; }
QScrollBar::add-line, QScrollBar::sub-line { background: none; border: none; }
"""


# ----------------- виджеты страниц -----------------

class SearchPage(QWidget):
    """Главная страница поиска."""
    COLUMNS = ["Запрос", "ФИО", "Телефон", "Дата рождения", "Адрес",
               "Регион", "Отделение", "Email", "Статус", "ID"]

    def __init__(self, parent=None):
        super().__init__(parent)
        self.window_ref = parent
        self.found_rows = []
        self.not_found_list = []
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(24, 24, 24, 24)
        root.setSpacing(16)

        # Заголовок
        head = QHBoxLayout()
        title = QLabel("Поиск волонтёров")
        title.setProperty("class", "h1")
        title.setObjectName("title")
        title.setStyleSheet("font-size: 22px; font-weight: 600;")
        head.addWidget(title)
        head.addStretch(1)
        root.addLayout(head)

        # Карточка одиночного поиска
        single = QFrame()
        single.setProperty("class", "card")
        single.setObjectName("singleCard")
        single.setStyleSheet("QFrame#singleCard { background:#161A22; border:1px solid #232836; border-radius:14px; }")
        sl = QGridLayout(single)
        sl.setContentsMargins(20, 20, 20, 20)
        sl.setHorizontalSpacing(12)
        sl.setVerticalSpacing(8)

        lbl_fio = QLabel("ФИО")
        lbl_fio.setStyleSheet("color:#7A8395; font-size:12px;")
        self.fio_edit = QLineEdit()
        self.fio_edit.setPlaceholderText("Например: Иванов Иван Иванович")

        lbl_phone = QLabel("Телефон")
        lbl_phone.setStyleSheet("color:#7A8395; font-size:12px;")
        self.phone_edit = QLineEdit()
        self.phone_edit.setPlaceholderText("79267560872 или 9267560872")

        self.search_btn = QPushButton("Найти")
        self.search_btn.setProperty("class", "primary")
        self.search_btn.setStyleSheet("background:#2A6FF0;color:white;border:none;border-radius:10px;padding:10px 22px;font-weight:600;")
        self.search_btn.clicked.connect(self.on_search)

        self.clear_btn = QPushButton("Очистить")
        self.clear_btn.setProperty("class", "ghost")
        self.clear_btn.setStyleSheet("background:transparent;color:#B6BDCC;border:1px solid #2A3040;border-radius:10px;padding:10px 16px;")
        self.clear_btn.clicked.connect(self.on_clear)

        sl.addWidget(lbl_fio,   0, 0)
        sl.addWidget(lbl_phone, 0, 1)
        sl.addWidget(self.fio_edit,   1, 0)
        sl.addWidget(self.phone_edit, 1, 1)

        btn_row = QHBoxLayout()
        btn_row.addStretch(1)
        btn_row.addWidget(self.clear_btn)
        btn_row.addWidget(self.search_btn)
        sl.addLayout(btn_row, 2, 0, 1, 2)

        root.addWidget(single)

        # Карточка массового поиска
        batch = QFrame()
        batch.setProperty("class", "card")
        batch.setObjectName("batchCard")
        batch.setStyleSheet("QFrame#batchCard { background:#161A22; border:1px solid #232836; border-radius:14px; }")
        bl = QVBoxLayout(batch)
        bl.setContentsMargins(20, 16, 20, 16)
        bl.setSpacing(8)

        bh = QHBoxLayout()
        b_title = QLabel("Массовый поиск")
        b_title.setStyleSheet("font-size:14px;font-weight:600;color:white;")
        b_hint = QLabel("по одному ФИО или телефону на строку")
        b_hint.setStyleSheet("color:#7A8395;font-size:12px;")
        bh.addWidget(b_title)
        bh.addSpacing(8)
        bh.addWidget(b_hint)
        bh.addStretch(1)
        bl.addLayout(bh)

        self.batch_text = QPlainTextEdit()
        self.batch_text.setPlaceholderText("Прохоренко Мария Олеговна\nЛунина Ольга Юрьевна\n79267560872")
        self.batch_text.setMinimumHeight(110)
        bl.addWidget(self.batch_text)

        bbtn = QHBoxLayout()
        bbtn.addStretch(1)
        self.batch_clear_btn = QPushButton("Очистить список")
        self.batch_clear_btn.setProperty("class", "ghost")
        self.batch_clear_btn.setStyleSheet("background:transparent;color:#B6BDCC;border:1px solid #2A3040;border-radius:10px;padding:8px 14px;")
        self.batch_clear_btn.clicked.connect(lambda: self.batch_text.clear())
        self.batch_search_btn = QPushButton("Найти список")
        self.batch_search_btn.setProperty("class", "primary")
        self.batch_search_btn.setStyleSheet("background:#2A6FF0;color:white;border:none;border-radius:10px;padding:8px 18px;font-weight:600;")
        self.batch_search_btn.clicked.connect(self.on_batch)
        bbtn.addWidget(self.batch_clear_btn)
        bbtn.addWidget(self.batch_search_btn)
        bl.addLayout(bbtn)

        root.addWidget(batch)

        # Заголовок таблицы и кнопка экспорта
        head2 = QHBoxLayout()
        self.results_title = QLabel("Результаты")
        self.results_title.setStyleSheet("font-size:14px;font-weight:600;color:white;")
        self.results_count = QLabel("")
        self.results_count.setStyleSheet("color:#7A8395;font-size:12px;")
        head2.addWidget(self.results_title)
        head2.addSpacing(8)
        head2.addWidget(self.results_count)
        head2.addStretch(1)
        self.export_btn = QPushButton("Экспорт в Excel")
        self.export_btn.setProperty("class", "ghost")
        self.export_btn.setStyleSheet("background:transparent;color:#B6BDCC;border:1px solid #2A3040;border-radius:10px;padding:8px 14px;")
        self.export_btn.clicked.connect(self.on_export)
        head2.addWidget(self.export_btn)
        root.addLayout(head2)

        # Таблица
        self.table = QTableWidget(0, len(self.COLUMNS))
        self.table.setHorizontalHeaderLabels(self.COLUMNS)
        self.table.verticalHeader().setVisible(False)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.setAlternatingRowColors(False)
        h = self.table.horizontalHeader()
        h.setSectionResizeMode(QHeaderView.Interactive)
        widths = [160, 240, 140, 110, 240, 140, 140, 160, 130, 80]
        for i, w in enumerate(widths):
            self.table.setColumnWidth(i, w)
        h.setStretchLastSection(True)
        root.addWidget(self.table, 1)

        # Не найдено
        nf_card = QFrame()
        nf_card.setObjectName("nfCard")
        nf_card.setStyleSheet("QFrame#nfCard { background:#161A22; border:1px solid #232836; border-radius:14px; }")
        nfl = QVBoxLayout(nf_card)
        nfl.setContentsMargins(20, 14, 20, 14)
        nfl.setSpacing(6)
        nf_title = QLabel("Не найдено")
        nf_title.setStyleSheet("font-size:13px;font-weight:600;color:white;")
        nfl.addWidget(nf_title)
        self.nf_text = QPlainTextEdit()
        self.nf_text.setReadOnly(True)
        self.nf_text.setMaximumHeight(90)
        nfl.addWidget(self.nf_text)
        root.addWidget(nf_card)

        # Enter в полях
        self.fio_edit.returnPressed.connect(self.on_search)
        self.phone_edit.returnPressed.connect(self.on_search)

    # ---- логика ----
    def _df(self):
        return self.window_ref.df if self.window_ref else None

    def _ensure_db(self):
        if self._df() is None:
            QMessageBox.information(self, APP_TITLE, "Сначала загрузи базу: кнопка вверху слева.")
            return False
        return True

    def _clear_results(self):
        self.table.setRowCount(0)
        self.nf_text.clear()
        self.found_rows = []
        self.not_found_list = []
        self.results_count.setText("")

    def _add_rows(self, rows, not_found):
        start = self.table.rowCount()
        self.table.setRowCount(start + len(rows))
        for i, r in enumerate(rows):
            for j, col in enumerate(self.COLUMNS):
                self.table.setItem(start + i, j, QTableWidgetItem(str(r.get(col, ""))))
        self.found_rows.extend(rows)
        if not_found:
            self.nf_text.appendPlainText("\n".join(not_found))
            self.not_found_list.extend(not_found)
        total_q = len(self.not_found_list) + len({r["Запрос"] for r in self.found_rows})
        self.results_count.setText(
            f"найдено записей: {len(self.found_rows)}  ·  не найдено: {len(self.not_found_list)}"
        )

    def on_clear(self):
        self.fio_edit.clear()
        self.phone_edit.clear()
        self._clear_results()

    def on_search(self):
        if not self._ensure_db():
            return
        self._clear_results()
        q = self.fio_edit.text().strip() or self.phone_edit.text().strip()
        if not q:
            QMessageBox.information(self, APP_TITLE, "Введи ФИО или телефон.")
            return
        res = search_one(self._df(), q)
        if len(res) == 0:
            self._add_rows([], [q])
        else:
            rows = [record_to_row(rec, q) for _, rec in res.iterrows()]
            self._add_rows(rows, [])

    def on_batch(self):
        if not self._ensure_db():
            return
        self._clear_results()
        raw = self.batch_text.toPlainText().strip()
        queries = [ln.strip() for ln in raw.splitlines() if ln.strip()]
        if not queries:
            QMessageBox.information(self, APP_TITLE, "Список пуст.")
            return
        rows, not_found = [], []
        df = self._df()
        for q in queries:
            res = search_one(df, q)
            if len(res) == 0:
                not_found.append(q)
            else:
                for _, rec in res.iterrows():
                    rows.append(record_to_row(rec, q))
        self._add_rows(rows, not_found)

    def on_export(self):
        if not self.found_rows and not self.not_found_list:
            QMessageBox.information(self, APP_TITLE, "Нет результатов для экспорта.")
            return
        path, _ = QFileDialog.getSaveFileName(
            self, "Сохранить результат", "result.xlsx", "Excel (*.xlsx)"
        )
        if not path:
            return
        try:
            with pd.ExcelWriter(path, engine="openpyxl") as writer:
                if self.found_rows:
                    pd.DataFrame(self.found_rows).to_excel(writer, index=False, sheet_name="found")
                else:
                    pd.DataFrame({"info": ["ничего не найдено"]}).to_excel(writer, index=False, sheet_name="found")
                pd.DataFrame({"Запрос": self.not_found_list}).to_excel(writer, index=False, sheet_name="not_found")
            QMessageBox.information(self, APP_TITLE, f"Сохранено:\n{path}")
        except Exception as e:
            QMessageBox.critical(self, APP_TITLE, f"Ошибка сохранения:\n{e}")


# ----------------- главное окно -----------------

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(APP_TITLE)
        self.resize(1280, 820)
        self.df = None
        self.loader = None
        self.settings = load_settings()

        self._build_ui()

        # Авто-загрузка базы
        last = self.settings.get("last_db")
        if last and os.path.exists(last):
            self._start_load(last)
        else:
            for name in ("backup.csv", "all_users.xlsx"):
                p = os.path.join(app_dir(), name)
                if os.path.exists(p):
                    self._start_load(p)
                    break

    def _build_ui(self):
        root = QWidget()
        root.setObjectName("root")
        self.setCentralWidget(root)

        h = QHBoxLayout(root)
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(0)

        # ---- Сайдбар ----
        side = QFrame()
        side.setObjectName("sidebar")
        side.setFixedWidth(240)
        sv = QVBoxLayout(side)
        sv.setContentsMargins(0, 0, 0, 0)
        sv.setSpacing(0)

        brand = QLabel("Поиск\nволонтёров")
        brand.setObjectName("brand")
        sub = QLabel("v1.0")
        sub.setObjectName("brandSub")
        sv.addWidget(brand)
        sv.addWidget(sub)

        # навигация
        self.nav_search = QPushButton("  Поиск")
        self.nav_search.setProperty("class", "navBtn")
        self.nav_search.setCheckable(True)
        self.nav_search.setChecked(True)

        self.nav_db = QPushButton("  База")
        self.nav_db.setProperty("class", "navBtn")
        self.nav_db.setCheckable(True)

        for b in (self.nav_search, self.nav_db):
            b.setCursor(Qt.PointingHandCursor)
            b.setMinimumHeight(38)
            sv.addWidget(b)
        sv.addStretch(1)

        # выбор базы
        self.db_label = QLabel("База не загружена")
        self.db_label.setWordWrap(True)
        self.db_label.setStyleSheet("color:#7A8395;font-size:11px;padding:8px 20px;")
        sv.addWidget(self.db_label)

        self.choose_btn = QPushButton("Выбрать файл базы")
        self.choose_btn.setProperty("class", "ghost")
        self.choose_btn.setStyleSheet(
            "background:transparent;color:#B6BDCC;border:1px solid #2A3040;border-radius:10px;"
            "padding:10px 12px;margin:0 14px 16px 14px;"
        )
        self.choose_btn.clicked.connect(self.on_choose_db)
        sv.addWidget(self.choose_btn)

        h.addWidget(side)

        # ---- Контент ----
        self.stack = QStackedWidget()
        self.search_page = SearchPage(self)
        self.db_page = self._build_db_page()
        self.stack.addWidget(self.search_page)
        self.stack.addWidget(self.db_page)
        h.addWidget(self.stack, 1)

        self.nav_search.clicked.connect(lambda: self._switch(0))
        self.nav_db.clicked.connect(lambda: self._switch(1))

        # Статус-бар
        sb = QStatusBar()
        self.setStatusBar(sb)
        self.status_label = QLabel("База не загружена")
        sb.addWidget(self.status_label)

        # Стили
        self.setStyleSheet(QSS)

    def _switch(self, idx):
        self.stack.setCurrentIndex(idx)
        self.nav_search.setChecked(idx == 0)
        self.nav_db.setChecked(idx == 1)

    def _build_db_page(self):
        w = QWidget()
        v = QVBoxLayout(w)
        v.setContentsMargins(24, 24, 24, 24)
        v.setSpacing(16)

        title = QLabel("База данных")
        title.setStyleSheet("font-size:22px;font-weight:600;color:white;")
        v.addWidget(title)

        card = QFrame()
        card.setObjectName("dbCard")
        card.setStyleSheet("QFrame#dbCard { background:#161A22; border:1px solid #232836; border-radius:14px; }")
        cv = QVBoxLayout(card)
        cv.setContentsMargins(24, 20, 24, 20)
        cv.setSpacing(8)

        h1 = QLabel("Текущий файл")
        h1.setStyleSheet("color:#7A8395;font-size:12px;")
        self.db_path_label = QLabel("—")
        self.db_path_label.setWordWrap(True)
        self.db_path_label.setStyleSheet("color:white;font-size:14px;")
        cv.addWidget(h1)
        cv.addWidget(self.db_path_label)

        h2 = QLabel("Записей")
        h2.setStyleSheet("color:#7A8395;font-size:12px;padding-top:8px;")
        self.db_count_label = QLabel("—")
        self.db_count_label.setStyleSheet("color:white;font-size:14px;")
        cv.addWidget(h2)
        cv.addWidget(self.db_count_label)

        row = QHBoxLayout()
        row.addStretch(1)
        change_btn = QPushButton("Сменить базу")
        change_btn.setProperty("class", "primary")
        change_btn.setStyleSheet("background:#2A6FF0;color:white;border:none;border-radius:10px;padding:10px 18px;font-weight:600;")
        change_btn.clicked.connect(self.on_choose_db)
        row.addWidget(change_btn)
        cv.addSpacing(8)
        cv.addLayout(row)

        v.addWidget(card)
        v.addStretch(1)
        return w

    # ---- загрузка БД ----
    def on_choose_db(self):
        start = self.settings.get("last_db") or app_dir()
        if os.path.isfile(start):
            start = os.path.dirname(start)
        path, _ = QFileDialog.getOpenFileName(
            self, "Выбери файл базы", start,
            "Поддерживаемые (*.csv *.xlsx);;CSV (*.csv);;Excel (*.xlsx)"
        )
        if path:
            self._start_load(path)

    def _start_load(self, path):
        self.status_label.setText(f"Загружаю: {os.path.basename(path)}...")
        self.db_label.setText(f"Загрузка...\n{os.path.basename(path)}")
        self.choose_btn.setEnabled(False)

        self.loader = DbLoader(path)
        self.loader.progress.connect(self._on_progress)
        self.loader.done.connect(lambda df, err: self._on_loaded(df, err, path))
        self.loader.start()

    def _on_progress(self, msg):
        self.status_label.setText(msg)

    def _on_loaded(self, df, err, path):
        self.choose_btn.setEnabled(True)
        if err:
            self.status_label.setText("Ошибка загрузки базы")
            self.db_label.setText("База не загружена")
            QMessageBox.critical(self, APP_TITLE, f"Не смог прочитать базу:\n{err}")
            return
        self.df = df
        cnt = len(df)
        name = os.path.basename(path)
        self.status_label.setText(f"База загружена: {cnt} записей  ·  {name}")
        self.db_label.setText(f"{name}\n{cnt} записей")
        self.db_path_label.setText(path)
        self.db_count_label.setText(str(cnt))
        self.settings["last_db"] = path
        save_settings(self.settings)


def main():
    app = QApplication(sys.argv)
    app.setApplicationName(APP_TITLE)
    app.setStyle("Fusion")
    win = MainWindow()
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
