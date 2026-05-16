"""
Чистильщик: читает backup.csv (или all_users.xlsx) и делает clean.xlsx
с понятными колонками: ФИО, Телефон, Дата рождения, Адрес и т.д.
"""

import os
import re
import pandas as pd

SRC_CSV = "backup.csv"
SRC_XLSX = "all_users.xlsx"
DST_XLSX = "clean.xlsx"


def load_source():
    if os.path.exists(SRC_CSV):
        print(f"Читаю {SRC_CSV}")
        return pd.read_csv(SRC_CSV, dtype=str, keep_default_na=False)
    if os.path.exists(SRC_XLSX):
        print(f"Читаю {SRC_XLSX}")
        return pd.read_excel(SRC_XLSX, dtype=str)
    raise FileNotFoundError("Не нашёл ни backup.csv, ни all_users.xlsx")


def col_or_empty(df, name):
    """Возвращает колонку как Series str, либо пустую."""
    if name and name in df.columns:
        return df[name].fillna("").astype(str).str.strip()
    return pd.Series([""] * len(df))


def fmt_date(val):
    if val is None or val == "" or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val)
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        y, mo, d = m.groups()
        return f"{d}.{mo}.{y}"
    return s


def fmt_phone(val):
    if val is None or val == "":
        return ""
    digits = re.sub(r"\D", "", str(val))
    if len(digits) == 11 and digits[0] in ("7", "8"):
        return "+7" + digits[1:]
    if len(digits) == 10:
        return "+7" + digits
    if not digits:
        return ""
    return digits


def fmt_gender(val):
    s = str(val).strip().lower()
    if s in ("1", "m", "male", "м", "муж"):
        return "М"
    if s in ("2", "f", "female", "ж", "жен"):
        return "Ж"
    return ""


def main():
    df = load_source()
    print(f"Загружено строк: {len(df)}")

    # Склеиваем ФИО
    last = col_or_empty(df, "last_name")
    first = col_or_empty(df, "first_name")
    patr = col_or_empty(df, "patronymic")
    fio = (last + " " + first + " " + patr).str.replace(r"\s+", " ", regex=True).str.strip()

    # Телефон: приоритет mobile, потом digits, потом home
    phone_mobile = col_or_empty(df, "phone_mobile")
    phone_digits = col_or_empty(df, "phone_mobile_digits")
    phone_home = col_or_empty(df, "phone_home")
    phone = phone_mobile.where(phone_mobile != "", phone_digits)
    phone = phone.where(phone != "", phone_home)
    phone = phone.apply(fmt_phone)

    out = pd.DataFrame()
    out["ФИО"] = fio
    out["Телефон"] = phone
    out["Дата рождения"] = col_or_empty(df, "birthday").apply(fmt_date)
    out["Пол"] = col_or_empty(df, "gender").apply(fmt_gender)
    out["Адрес"] = col_or_empty(df, "address")
    out["Регион"] = col_or_empty(df, "region_name")
    out["Отделение"] = col_or_empty(df, "branch_name")
    out["Первичка"] = col_or_empty(df, "primary_name")
    out["УИК"] = col_or_empty(df, "uik_n")
    out["Координатор"] = col_or_empty(df, "foreman")
    out["Ячейка"] = col_or_empty(df, "origin_cell_title")
    out["Email"] = col_or_empty(df, "email")
    out["Статус"] = col_or_empty(df, "cfacbg")
    out["Дата создания"] = col_or_empty(df, "created_at").apply(fmt_date)
    out["Дата обновления"] = col_or_empty(df, "updated_at").apply(fmt_date)
    out["ID"] = col_or_empty(df, "id")

    # Удалим пустые колонки (если каких-то полей нет в источнике)
    for c in list(out.columns):
        if (out[c] == "").all():
            del out[c]

    # Сортировка для удобства
    out = out.sort_values(by="ФИО", kind="stable").reset_index(drop=True)

    # Сохраняем с авто-шириной и фильтром
    with pd.ExcelWriter(DST_XLSX, engine="openpyxl") as writer:
        out.to_excel(writer, index=False, sheet_name="users")
        ws = writer.sheets["users"]
        # фильтр на шапку
        ws.auto_filter.ref = ws.dimensions
        # фиксируем шапку
        ws.freeze_panes = "A2"
        # ширина по содержимому первых 1000 строк
        for i, col in enumerate(out.columns, start=1):
            sample = out[col].head(1000).tolist()
            max_len = max([len(str(col))] + [len(str(v)) for v in sample])
            ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = min(max_len + 2, 60)

    print()
    print(f"Готово: {DST_XLSX}")
    print("Колонки:", list(out.columns))
    print("Строк:", len(out))


if __name__ == "__main__":
    main()
