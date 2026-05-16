"""
Поиск людей по ФИО или телефону.

Использование:
1. Создай файл queries.txt и положи туда запросы — по одному на строку.
   Можно мешать ФИО и телефоны:
       Прохоренко Мария Олеговна
       Лунина Ольга Юрьевна
       79267560872
       9267560872
       +7 (926) 756-08-72
2. Запусти:  python search.py
3. Результат: result.xlsx (листы "found" и "not_found") + вывод в консоль.
"""

import os
import re
import sys
import pandas as pd

SRC_CSV = "backup.csv"
SRC_XLSX = "all_users.xlsx"
QUERIES_FILE = "queries.txt"
RESULT_XLSX = "result.xlsx"


# ---------- утилиты ----------

def normalize_phone(s):
    """Возвращает 10 последних цифр номера (без кода страны), либо ''. """
    digits = re.sub(r"\D", "", str(s or ""))
    if not digits:
        return ""
    if len(digits) == 11 and digits[0] in ("7", "8"):
        digits = digits[1:]
    if len(digits) >= 10:
        return digits[-10:]
    return digits


def normalize_fio(s):
    """Lower-case, пробелы схлопнуты, ё->е, дефисы -> пробел."""
    s = str(s or "").lower().replace("ё", "е").replace("-", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def is_phone_query(s):
    digits = re.sub(r"\D", "", str(s or ""))
    return len(digits) >= 10


def fmt_phone_display(d10):
    if not d10 or len(d10) != 10:
        return d10 or ""
    return "+7" + d10


# ---------- загрузка базы ----------

def load_db():
    if os.path.exists(SRC_CSV):
        print(f"Читаю базу: {SRC_CSV}")
        df = pd.read_csv(SRC_CSV, dtype=str, keep_default_na=False)
    elif os.path.exists(SRC_XLSX):
        print(f"Читаю базу: {SRC_XLSX}")
        df = pd.read_excel(SRC_XLSX, dtype=str)
    else:
        raise FileNotFoundError("Не нашёл backup.csv или all_users.xlsx")
    print(f"Записей в базе: {len(df)}")
    return df


def build_index(df):
    """Готовим вспомогательные колонки для быстрого поиска."""
    last = df.get("last_name", "").fillna("").astype(str)
    first = df.get("first_name", "").fillna("").astype(str)
    patr = df.get("patronymic", "").fillna("").astype(str)

    df["_fio_full"] = (last + " " + first + " " + patr).str.replace(r"\s+", " ", regex=True).str.strip()
    df["_fio_norm"] = df["_fio_full"].apply(normalize_fio)
    df["_fio_short"] = (last + " " + first).str.replace(r"\s+", " ", regex=True).str.strip().apply(normalize_fio)

    pm = df.get("phone_mobile", "").fillna("").astype(str)
    pd_ = df.get("phone_mobile_digits", "").fillna("").astype(str)
    ph = df.get("phone_home", "").fillna("").astype(str)
    df["_phone_norm"] = pm.where(pm != "", pd_).where(lambda x: x != "", ph).apply(normalize_phone)
    return df


# ---------- поиск ----------

def search_phone(df, query):
    target = normalize_phone(query)
    if not target:
        return df.iloc[0:0]
    return df[df["_phone_norm"] == target]


def search_fio(df, query):
    q = normalize_fio(query)
    if not q:
        return df.iloc[0:0]
    # 1) точное совпадение полного ФИО
    exact = df[df["_fio_norm"] == q]
    if len(exact):
        return exact
    # 2) совпадение фамилии+имени (если в запросе нет отчества)
    parts = q.split()
    if len(parts) == 2:
        sub = df[df["_fio_short"] == q]
        if len(sub):
            return sub
    # 3) частичное: все слова запроса входят в _fio_norm
    mask = pd.Series([True] * len(df), index=df.index)
    for p in parts:
        mask &= df["_fio_norm"].str.contains(re.escape(p), na=False)
    return df[mask]


def make_row(rec, query):
    """Формируем удобную строку результата из записи БД."""
    last = rec.get("last_name", "") or ""
    first = rec.get("first_name", "") or ""
    patr = rec.get("patronymic", "") or ""
    fio = re.sub(r"\s+", " ", f"{last} {first} {patr}").strip()
    phone = fmt_phone_display(rec.get("_phone_norm", "") or "")
    bday = rec.get("birthday", "") or ""
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", bday)
    if m:
        y, mo, d = m.groups()
        bday = f"{d}.{mo}.{y}"
    return {
        "Запрос": query,
        "ФИО": fio,
        "Телефон": phone,
        "Дата рождения": bday,
        "Адрес": rec.get("address", "") or "",
        "Регион": rec.get("region_name", "") or "",
        "Отделение": rec.get("branch_name", "") or "",
        "Email": rec.get("email", "") or "",
        "Статус": rec.get("cfacbg", "") or "",
        "ID": rec.get("id", "") or "",
    }


# ---------- запросы ----------

def read_queries():
    args = [a for a in sys.argv[1:] if a.strip()]
    if args:
        return args
    if not os.path.exists(QUERIES_FILE):
        # создаём пустой файл-шаблон
        with open(QUERIES_FILE, "w", encoding="utf-8") as f:
            f.write("# Положи сюда ФИО или телефоны, по одному на строку\n")
        print(f"Создал {QUERIES_FILE} — заполни его и запусти снова.")
        sys.exit(0)
    with open(QUERIES_FILE, "r", encoding="utf-8") as f:
        lines = [ln.strip() for ln in f]
    return [ln for ln in lines if ln and not ln.startswith("#")]


# ---------- main ----------

def main():
    queries = read_queries()
    if not queries:
        print("Пустой список запросов")
        return

    df = load_db()
    df = build_index(df)

    found_rows = []
    not_found = []
    multi = []

    for q in queries:
        if is_phone_query(q):
            res = search_phone(df, q)
        else:
            res = search_fio(df, q)

        if len(res) == 0:
            not_found.append(q)
            print(f"  [НЕ НАЙДЕН] {q}")
        else:
            for _, rec in res.iterrows():
                found_rows.append(make_row(rec, q))
            tag = "" if len(res) == 1 else f"  (найдено {len(res)})"
            print(f"  [OK] {q}{tag}")
            if len(res) > 1:
                multi.append((q, len(res)))

    found_df = pd.DataFrame(found_rows)
    not_found_df = pd.DataFrame({"Запрос": not_found})

    with pd.ExcelWriter(RESULT_XLSX, engine="openpyxl") as writer:
        if len(found_df):
            found_df.to_excel(writer, index=False, sheet_name="found")
        else:
            pd.DataFrame({"info": ["ничего не найдено"]}).to_excel(writer, index=False, sheet_name="found")
        not_found_df.to_excel(writer, index=False, sheet_name="not_found")

        # авто-ширина
        for sheet_name, sdf in [("found", found_df), ("not_found", not_found_df)]:
            ws = writer.sheets[sheet_name]
            ws.freeze_panes = "A2"
            if len(sdf):
                ws.auto_filter.ref = ws.dimensions
                for i, col in enumerate(sdf.columns, start=1):
                    sample = sdf[col].astype(str).head(500).tolist()
                    max_len = max([len(str(col))] + [len(v) for v in sample])
                    ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = min(max_len + 2, 60)

    print()
    print("=" * 50)
    print(f"Запросов: {len(queries)}")
    print(f"Найдено записей: {len(found_df)}")
    print(f"Не найдено запросов: {len(not_found)}")
    if multi:
        print(f"Запросов с несколькими совпадениями: {len(multi)}")
        for q, n in multi:
            print(f"   - {q}: {n} совпадений")
    print(f"Результат: {RESULT_XLSX}")


if __name__ == "__main__":
    main()
