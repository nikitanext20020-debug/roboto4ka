"""Загрузка базы и поиск."""

import os
import re
import pandas as pd
from PySide6.QtCore import QThread, Signal

from .utils import (
    normalize_phone, normalize_fio, is_phone_query,
    fmt_phone, fmt_date, extract_text_from_docx,
)


class DbLoader(QThread):
    done = Signal(object, str)        # (df_or_None, error_msg)
    progress = Signal(str)

    def __init__(self, path):
        super().__init__()
        self.path = path

    def run(self):
        try:
            ext = os.path.splitext(self.path)[1].lower()
            self.progress.emit(f"Чтение {os.path.basename(self.path)}...")

            if ext == ".csv":
                df = pd.read_csv(self.path, dtype=str, keep_default_na=False)
            elif ext in (".xlsx", ".xls"):
                df = pd.read_excel(self.path, dtype=str)
                df = df.fillna("")
            elif ext == ".docx":
                # Извлекаем текст и пытаемся вытащить ФИО+телефоны
                text = extract_text_from_docx(self.path)
                df = self._df_from_text(text)
            else:
                # как обычный текст
                with open(self.path, "r", encoding="utf-8", errors="ignore") as f:
                    text = f.read()
                df = self._df_from_text(text)

            self.progress.emit("Индексация...")
            df = build_index(df)
            self.done.emit(df, "")
        except Exception as e:
            self.done.emit(None, str(e))

    @staticmethod
    def _df_from_text(text):
        from .utils import find_fios_in_text, find_phones_in_text
        fios = find_fios_in_text(text)
        phones = list(find_phones_in_text(text))
        rows = []
        # ФИО как отдельные записи
        for last, first, patr in fios:
            rows.append({
                "last_name": last, "first_name": first, "patronymic": patr,
                "phone_mobile": "", "address": "", "id": "",
            })
        # телефоны без ФИО — отдельно
        for d10 in phones:
            rows.append({
                "last_name": "", "first_name": "", "patronymic": "",
                "phone_mobile": d10, "address": "", "id": "",
            })
        return pd.DataFrame(rows) if rows else pd.DataFrame(
            columns=["last_name", "first_name", "patronymic", "phone_mobile", "address", "id"]
        )


def build_index(df):
    """Достраиваем технические колонки для поиска."""
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
    return df


def search_one(df, query):
    if df is None or len(df) == 0:
        return None
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
