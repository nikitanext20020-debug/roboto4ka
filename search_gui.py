"""
Простое десктоп-приложение для поиска по базе.
Не требует никаких внешних библиотек кроме pandas и openpyxl.

Запуск:  python search_gui.py
Сборка в .exe:  pyinstaller --onefile --noconsole search_gui.py
"""

import os
import re
import sys
import threading
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import pandas as pd

SRC_CSV = "backup.csv"
SRC_XLSX = "all_users.xlsx"


# ---------------- утилиты ----------------

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


def fmt_phone_display(d10):
    if d10 and len(d10) == 10:
        return "+7" + d10
    return d10 or ""


def fmt_date(s):
    s = str(s or "")
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        y, mo, d = m.groups()
        return f"{d}.{mo}.{y}"
    return s


# ---------------- база ----------------

def find_db_path():
    here = os.path.dirname(os.path.abspath(sys.argv[0]))
    for name in (SRC_CSV, SRC_XLSX):
        p = os.path.join(here, name)
        if os.path.exists(p):
            return p
    # для случая запуска не из корня
    for name in (SRC_CSV, SRC_XLSX):
        if os.path.exists(name):
            return os.path.abspath(name)
    return None


def load_db(path):
    if path.lower().endswith(".csv"):
        df = pd.read_csv(path, dtype=str, keep_default_na=False)
    else:
        df = pd.read_excel(path, dtype=str)
        df = df.fillna("")

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


# ---------------- поиск ----------------

def search_one(df, query):
    q = query.strip()
    if not q:
        return df.iloc[0:0]
    if is_phone_query(q):
        target = normalize_phone(q)
        return df[df["_phone_norm"] == target]
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
        "Телефон": fmt_phone_display(rec.get("_phone_norm", "") or ""),
        "Дата рождения": fmt_date(rec.get("birthday", "")),
        "Адрес": rec.get("address", "") or "",
        "Регион": rec.get("region_name", "") or "",
        "Отделение": rec.get("branch_name", "") or "",
        "Email": rec.get("email", "") or "",
        "Статус": rec.get("cfacbg", "") or "",
        "ID": rec.get("id", "") or "",
    }


# ---------------- GUI ----------------

class App(tk.Tk):
    COLUMNS = ["Запрос", "ФИО", "Телефон", "Дата рождения", "Адрес",
               "Регион", "Отделение", "Email", "Статус", "ID"]

    def __init__(self):
        super().__init__()
        self.title("Поиск по базе волонтёров")
        self.geometry("1200x720")
        self.df = None
        self.last_results = []
        self.last_not_found = []

        self._build_ui()
        self.after(100, self._load_db_async)

    # ---------- интерфейс ----------
    def _build_ui(self):
        pad = {"padx": 8, "pady": 4}

        top = ttk.Frame(self)
        top.pack(fill="x", **pad)

        ttk.Label(top, text="ФИО:").grid(row=0, column=0, sticky="w")
        self.fio_var = tk.StringVar()
        self.fio_entry = ttk.Entry(top, textvariable=self.fio_var, width=40)
        self.fio_entry.grid(row=0, column=1, sticky="we", padx=(4, 16))

        ttk.Label(top, text="Телефон:").grid(row=0, column=2, sticky="w")
        self.phone_var = tk.StringVar()
        self.phone_entry = ttk.Entry(top, textvariable=self.phone_var, width=20)
        self.phone_entry.grid(row=0, column=3, sticky="we", padx=(4, 16))

        self.search_btn = ttk.Button(top, text="Найти", command=self.on_search)
        self.search_btn.grid(row=0, column=4, padx=4)

        self.clear_btn = ttk.Button(top, text="Очистить", command=self.on_clear)
        self.clear_btn.grid(row=0, column=5, padx=4)

        top.columnconfigure(1, weight=1)
        top.columnconfigure(3, weight=0)

        # Массовый поиск
        batch_frame = ttk.LabelFrame(self, text="Массовый поиск (по одному ФИО или телефону на строку)")
        batch_frame.pack(fill="x", **pad)

        self.batch_text = tk.Text(batch_frame, height=5, wrap="word")
        self.batch_text.pack(side="left", fill="both", expand=True, padx=4, pady=4)

        batch_btns = ttk.Frame(batch_frame)
        batch_btns.pack(side="right", fill="y", padx=4, pady=4)
        ttk.Button(batch_btns, text="Найти список", command=self.on_search_batch).pack(fill="x")
        ttk.Button(batch_btns, text="Очистить", command=lambda: self.batch_text.delete("1.0", "end")).pack(fill="x", pady=(4, 0))

        # Статус и экспорт
        bar = ttk.Frame(self)
        bar.pack(fill="x", **pad)
        self.status_var = tk.StringVar(value="Загружаю базу...")
        ttk.Label(bar, textvariable=self.status_var).pack(side="left")
        ttk.Button(bar, text="Экспорт в Excel", command=self.on_export).pack(side="right")

        # Таблица результатов
        results_frame = ttk.LabelFrame(self, text="Найдено")
        results_frame.pack(fill="both", expand=True, **pad)

        self.tree = ttk.Treeview(results_frame, columns=self.COLUMNS, show="headings", height=15)
        widths = {"Запрос": 160, "ФИО": 220, "Телефон": 130, "Дата рождения": 110,
                  "Адрес": 240, "Регион": 140, "Отделение": 140, "Email": 160,
                  "Статус": 130, "ID": 80}
        for c in self.COLUMNS:
            self.tree.heading(c, text=c)
            self.tree.column(c, width=widths.get(c, 120), anchor="w")
        self.tree.pack(side="left", fill="both", expand=True)

        sb = ttk.Scrollbar(results_frame, orient="vertical", command=self.tree.yview)
        sb.pack(side="right", fill="y")
        self.tree.configure(yscrollcommand=sb.set)

        # Не найдено
        nf_frame = ttk.LabelFrame(self, text="Не найдено")
        nf_frame.pack(fill="x", **pad)
        self.not_found_text = tk.Text(nf_frame, height=4, wrap="word")
        self.not_found_text.pack(fill="x", padx=4, pady=4)
        self.not_found_text.configure(state="disabled")

        # Enter в полях запускает поиск
        self.fio_entry.bind("<Return>", lambda e: self.on_search())
        self.phone_entry.bind("<Return>", lambda e: self.on_search())

    # ---------- логика ----------
    def _load_db_async(self):
        path = find_db_path()
        if not path:
            messagebox.showerror(
                "Ошибка",
                "Не нашёл файл базы (backup.csv или all_users.xlsx).\n"
                "Положи файл рядом с программой."
            )
            self.status_var.set("База не загружена")
            return

        def worker():
            try:
                df = load_db(path)
                self.df = df
                self.status_var.set(f"База загружена: {len(df)} записей  ·  {os.path.basename(path)}")
            except Exception as e:
                self.status_var.set("Ошибка загрузки базы")
                messagebox.showerror("Ошибка", f"Не смог прочитать базу:\n{e}")

        threading.Thread(target=worker, daemon=True).start()

    def _ensure_db(self):
        if self.df is None:
            messagebox.showwarning("База ещё не готова", "Подожди — база пока загружается.")
            return False
        return True

    def _clear_results(self):
        for iid in self.tree.get_children():
            self.tree.delete(iid)
        self.not_found_text.configure(state="normal")
        self.not_found_text.delete("1.0", "end")
        self.not_found_text.configure(state="disabled")
        self.last_results = []
        self.last_not_found = []

    def _add_results(self, rows, not_found):
        for r in rows:
            self.tree.insert("", "end", values=[r.get(c, "") for c in self.COLUMNS])
        self.last_results.extend(rows)

        if not_found:
            self.not_found_text.configure(state="normal")
            for q in not_found:
                self.not_found_text.insert("end", q + "\n")
            self.not_found_text.configure(state="disabled")
            self.last_not_found.extend(not_found)

    def on_clear(self):
        self.fio_var.set("")
        self.phone_var.set("")
        self._clear_results()

    def on_search(self):
        if not self._ensure_db():
            return
        self._clear_results()

        q = self.fio_var.get().strip() or self.phone_var.get().strip()
        if not q:
            messagebox.showinfo("Пусто", "Введи ФИО или телефон.")
            return

        res = search_one(self.df, q)
        if len(res) == 0:
            self._add_results([], [q])
            self.status_var.set(f"Не найдено: {q}")
            return

        rows = [record_to_row(rec, q) for _, rec in res.iterrows()]
        self._add_results(rows, [])
        self.status_var.set(f"Найдено: {len(rows)}")

    def on_search_batch(self):
        if not self._ensure_db():
            return
        raw = self.batch_text.get("1.0", "end").strip()
        if not raw:
            messagebox.showinfo("Пусто", "Список пуст.")
            return

        queries = [ln.strip() for ln in raw.splitlines() if ln.strip()]
        self._clear_results()

        rows = []
        not_found = []
        for q in queries:
            res = search_one(self.df, q)
            if len(res) == 0:
                not_found.append(q)
            else:
                for _, rec in res.iterrows():
                    rows.append(record_to_row(rec, q))

        self._add_results(rows, not_found)
        self.status_var.set(
            f"Запросов: {len(queries)}  ·  Найдено записей: {len(rows)}  ·  Не найдено: {len(not_found)}"
        )

    def on_export(self):
        if not self.last_results and not self.last_not_found:
            messagebox.showinfo("Пусто", "Нет результатов для экспорта.")
            return
        path = filedialog.asksaveasfilename(
            title="Сохранить результат",
            defaultextension=".xlsx",
            filetypes=[("Excel", "*.xlsx")],
            initialfile="result.xlsx",
        )
        if not path:
            return
        try:
            with pd.ExcelWriter(path, engine="openpyxl") as writer:
                if self.last_results:
                    pd.DataFrame(self.last_results).to_excel(writer, index=False, sheet_name="found")
                else:
                    pd.DataFrame({"info": ["ничего не найдено"]}).to_excel(writer, index=False, sheet_name="found")
                pd.DataFrame({"Запрос": self.last_not_found}).to_excel(writer, index=False, sheet_name="not_found")
            messagebox.showinfo("Готово", f"Сохранено: {path}")
        except Exception as e:
            messagebox.showerror("Ошибка", f"Не смог сохранить:\n{e}")


if __name__ == "__main__":
    App().mainloop()
