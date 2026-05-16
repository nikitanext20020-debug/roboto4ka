"""Страница: Поиск по базам."""

import os
import pandas as pd
from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QFrame, QLabel,
    QLineEdit, QPushButton, QPlainTextEdit, QTableWidget, QTableWidgetItem,
    QFileDialog, QMessageBox, QHeaderView, QAbstractItemView, QSizePolicy,
)

from .db import DbLoader, search_one, record_to_row


class BatchSearchThread(QThread):
    """Поиск списка запросов в фоне, чтобы UI не вис."""
    done = Signal(list, list)  # rows, not_found

    def __init__(self, df, queries):
        super().__init__()
        self.df = df
        self.queries = queries

    def run(self):
        rows, not_found = [], []
        for q in self.queries:
            res = search_one(self.df, q)
            if res is None or len(res) == 0:
                not_found.append(q)
            else:
                for _, rec in res.iterrows():
                    rows.append(record_to_row(rec, q))
        self.done.emit(rows, not_found)


class SearchPage(QWidget):
    COLUMNS = ["Запрос", "ФИО", "Телефон", "Дата рождения", "Адрес",
               "Регион", "Отделение", "Email", "Статус", "ID"]

    def __init__(self, app):
        super().__init__()
        self.app = app
        self.df = None
        self.db_path = ""
        self.found_rows = []
        self.not_found_list = []
        self._loader = None
        self._batch_thread = None
        self._build()

    def _build(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(28, 24, 28, 24)
        root.setSpacing(16)

        # Заголовок и инфо о базе
        head = QHBoxLayout()
        title = QLabel("Поиск по базам")
        title.setProperty("class", "h1")
        title.setStyleSheet("font-size:24px;font-weight:700;color:white;")
        head.addWidget(title)
        head.addStretch(1)

        self.db_info = QLabel("База не загружена")
        self.db_info.setStyleSheet("color:#8A92A6;font-size:12px;")
        head.addWidget(self.db_info)

        self.choose_db_btn = QPushButton("Выбрать файл базы")
        self.choose_db_btn.setProperty("class", "ghost")
        self.choose_db_btn.setStyleSheet(
            "background:transparent;color:#E8EAF0;border:1px solid #2A2F3D;"
            "border-radius:10px;padding:8px 14px;"
        )
        self.choose_db_btn.clicked.connect(self.on_choose_db)
        head.addSpacing(12)
        head.addWidget(self.choose_db_btn)
        root.addLayout(head)

        # Карточка одиночного поиска
        single = QFrame()
        single.setObjectName("singleCard")
        single.setStyleSheet(
            "QFrame#singleCard { background:#171922; border:1px solid #2A2F3D; border-radius:14px; }"
        )
        sl = QGridLayout(single)
        sl.setContentsMargins(20, 18, 20, 18)
        sl.setHorizontalSpacing(12)
        sl.setVerticalSpacing(8)

        l1 = QLabel("ФИО")
        l1.setStyleSheet("color:#8A92A6;font-size:12px;")
        l2 = QLabel("Телефон")
        l2.setStyleSheet("color:#8A92A6;font-size:12px;")
        self.fio_edit = QLineEdit()
        self.fio_edit.setPlaceholderText("Иванов Иван Иванович")
        self.phone_edit = QLineEdit()
        self.phone_edit.setPlaceholderText("79267560872 или 9267560872")

        self.search_btn = QPushButton("Найти")
        self.search_btn.setProperty("class", "primary")
        self.search_btn.setStyleSheet(
            "background:#7C5CFF;color:white;border:none;border-radius:10px;"
            "padding:10px 22px;font-weight:600;"
        )
        self.search_btn.clicked.connect(self.on_search)
        self.clear_btn = QPushButton("Очистить")
        self.clear_btn.setProperty("class", "ghost")
        self.clear_btn.setStyleSheet(
            "background:transparent;color:#E8EAF0;border:1px solid #2A2F3D;"
            "border-radius:10px;padding:10px 16px;"
        )
        self.clear_btn.clicked.connect(self.on_clear)

        sl.addWidget(l1, 0, 0)
        sl.addWidget(l2, 0, 1)
        sl.addWidget(self.fio_edit, 1, 0)
        sl.addWidget(self.phone_edit, 1, 1)
        bb = QHBoxLayout()
        bb.addStretch(1)
        bb.addWidget(self.clear_btn)
        bb.addWidget(self.search_btn)
        sl.addLayout(bb, 2, 0, 1, 2)
        root.addWidget(single)

        # Карточка массового поиска
        batch = QFrame()
        batch.setObjectName("batchCard")
        batch.setStyleSheet(
            "QFrame#batchCard { background:#171922; border:1px solid #2A2F3D; border-radius:14px; }"
        )
        bl = QVBoxLayout(batch)
        bl.setContentsMargins(20, 14, 20, 14)
        bl.setSpacing(8)

        bh = QHBoxLayout()
        b_t = QLabel("Массовый поиск")
        b_t.setStyleSheet("font-size:14px;font-weight:600;color:white;")
        b_h = QLabel("по одному ФИО или телефону на строку")
        b_h.setStyleSheet("color:#8A92A6;font-size:12px;")
        bh.addWidget(b_t)
        bh.addSpacing(8)
        bh.addWidget(b_h)
        bh.addStretch(1)
        bl.addLayout(bh)

        self.batch_text = QPlainTextEdit()
        self.batch_text.setPlaceholderText("Прохоренко Мария Олеговна\nЛунина Ольга Юрьевна\n79267560872")
        self.batch_text.setMinimumHeight(110)
        bl.addWidget(self.batch_text)

        bbtn = QHBoxLayout()
        bbtn.addStretch(1)
        clr = QPushButton("Очистить список")
        clr.setStyleSheet(
            "background:transparent;color:#E8EAF0;border:1px solid #2A2F3D;"
            "border-radius:10px;padding:8px 14px;"
        )
        clr.clicked.connect(lambda: self.batch_text.clear())
        self.batch_btn = QPushButton("Найти список")
        self.batch_btn.setStyleSheet(
            "background:#7C5CFF;color:white;border:none;border-radius:10px;"
            "padding:8px 18px;font-weight:600;"
        )
        self.batch_btn.clicked.connect(self.on_batch)
        bbtn.addWidget(clr)
        bbtn.addWidget(self.batch_btn)
        bl.addLayout(bbtn)
        root.addWidget(batch)

        # Заголовок результатов и экспорт
        h2 = QHBoxLayout()
        rt = QLabel("Результаты")
        rt.setStyleSheet("font-size:14px;font-weight:600;color:white;")
        self.count_label = QLabel("")
        self.count_label.setStyleSheet("color:#8A92A6;font-size:12px;")
        h2.addWidget(rt)
        h2.addSpacing(8)
        h2.addWidget(self.count_label)
        h2.addStretch(1)
        self.export_btn = QPushButton("Экспорт в Excel")
        self.export_btn.setStyleSheet(
            "background:transparent;color:#E8EAF0;border:1px solid #2A2F3D;"
            "border-radius:10px;padding:8px 14px;"
        )
        self.export_btn.clicked.connect(self.on_export)
        h2.addWidget(self.export_btn)
        root.addLayout(h2)

        # Таблица
        self.table = QTableWidget(0, len(self.COLUMNS))
        self.table.setHorizontalHeaderLabels(self.COLUMNS)
        self.table.verticalHeader().setVisible(False)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.setMinimumHeight(260)
        widths = [160, 240, 140, 110, 240, 140, 140, 160, 130, 80]
        for i, w in enumerate(widths):
            self.table.setColumnWidth(i, w)
        self.table.horizontalHeader().setStretchLastSection(True)
        root.addWidget(self.table, 3)

        # Не найдено
        nf = QFrame()
        nf.setObjectName("nfCard")
        nf.setStyleSheet(
            "QFrame#nfCard { background:#171922; border:1px solid #2A2F3D; border-radius:14px; }"
        )
        nfl = QVBoxLayout(nf)
        nfl.setContentsMargins(20, 12, 20, 12)
        nfl.setSpacing(6)
        nfl.addWidget(QLabel("Не найдено"))
        self.nf_text = QPlainTextEdit()
        self.nf_text.setReadOnly(True)
        self.nf_text.setMaximumHeight(86)
        nfl.addWidget(self.nf_text)
        root.addWidget(nf)

        self.fio_edit.returnPressed.connect(self.on_search)
        self.phone_edit.returnPressed.connect(self.on_search)

    # --------- логика ---------

    def _ensure_db(self):
        if self.df is None:
            QMessageBox.information(
                self, "Roboto4ka",
                "Сначала выбери файл базы (Excel, CSV или Word с ФИО/телефонами)."
            )
            return False
        return True

    def _clear_results(self):
        self.table.setRowCount(0)
        self.nf_text.clear()
        self.found_rows.clear()
        self.not_found_list.clear()
        self.count_label.setText("")

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
        self.count_label.setText(
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
            QMessageBox.information(self, "Roboto4ka", "Введи ФИО или телефон.")
            return
        self.app.show_loading("Ищу...")
        # Запускаем через QThread, чтоб увидеть оверлей
        self._batch_thread = BatchSearchThread(self.df, [q])
        self._batch_thread.done.connect(self._on_search_done)
        self._batch_thread.start()

    def on_batch(self):
        if not self._ensure_db():
            return
        self._clear_results()
        raw = self.batch_text.toPlainText().strip()
        queries = [ln.strip() for ln in raw.splitlines() if ln.strip()]
        if not queries:
            QMessageBox.information(self, "Roboto4ka", "Список пуст.")
            return
        self.app.show_loading(f"Ищу {len(queries)} запросов...")
        self._batch_thread = BatchSearchThread(self.df, queries)
        self._batch_thread.done.connect(self._on_search_done)
        self._batch_thread.start()

    def _on_search_done(self, rows, not_found):
        self.app.hide_loading()
        self._add_rows(rows, not_found)

    def on_export(self):
        if not self.found_rows and not self.not_found_list:
            QMessageBox.information(self, "Roboto4ka", "Нет результатов для экспорта.")
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
            QMessageBox.information(self, "Roboto4ka", f"Сохранено:\n{path}")
        except Exception as e:
            QMessageBox.critical(self, "Roboto4ka", f"Ошибка сохранения:\n{e}")

    # --------- база ---------

    def on_choose_db(self):
        start = self.app.settings.get("last_db") or ""
        if start and os.path.isfile(start):
            start = os.path.dirname(start)
        path, _ = QFileDialog.getOpenFileName(
            self, "Выбери файл базы", start,
            "Поддерживаемые (*.csv *.xlsx *.xls *.docx);;CSV (*.csv);;Excel (*.xlsx *.xls);;Word (*.docx)"
        )
        if path:
            self.start_load(path)

    def start_load(self, path):
        self.db_path = path
        self.app.show_loading(f"Загружаю {os.path.basename(path)}...")
        self._loader = DbLoader(path)
        self._loader.progress.connect(lambda m: self.app.set_loading_text(m))
        self._loader.done.connect(self._on_db_loaded)
        self._loader.start()

    def _on_db_loaded(self, df, err):
        self.app.hide_loading()
        if err:
            self.db_info.setText("База не загружена")
            QMessageBox.critical(self, "Roboto4ka", f"Не смог прочитать:\n{err}")
            return
        self.df = df
        name = os.path.basename(self.db_path)
        self.db_info.setText(f"{name}  ·  {len(df)} записей")
        self.app.set_status(f"База: {name}  ·  {len(df)} записей")
        self.app.settings["last_db"] = self.db_path
        from .utils import save_settings
        save_settings(self.app.settings)
