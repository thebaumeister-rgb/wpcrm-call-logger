from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path


DATA_DIR = Path("data")
JSONL_PATH = DATA_DIR / "sales_calls.jsonl"
CSV_PATH = DATA_DIR / "sales_calls.csv"
APPOINTMENT_TYPES = {
    "1": "conference call",
    "2": "meeting",
}


@dataclass
class SalesCall:
    contact_name: str
    appointment_type: str
    appointment_datetime: str
    meeting_point: str
    actions: str
    recorded_at: str


def prompt_required(prompt: str) -> str:
    while True:
        value = input(prompt).strip()
        if value:
            return value
        print("Please enter a value.")


def prompt_appointment_type() -> str:
    print("\nAppointment type:")
    for key, label in APPOINTMENT_TYPES.items():
        print(f"  {key}. {label}")

    while True:
        choice = input("Choose 1 or 2: ").strip().lower()
        if choice in APPOINTMENT_TYPES:
            return APPOINTMENT_TYPES[choice]
        if choice in APPOINTMENT_TYPES.values():
            return choice
        print("Please choose 1 for conference call or 2 for meeting.")


def prompt_datetime() -> str:
    now = datetime.now().replace(second=0, microsecond=0)
    default_value = now.isoformat(sep=" ")
    value = input(f"\nDate/time [{default_value}]: ").strip()
    return value or default_value


def prompt_multiline(prompt: str) -> str:
    print(prompt)
    print("Enter one item per line. Press Enter on a blank line when finished.")
    lines: list[str] = []
    while True:
        line = input("- ").strip()
        if not line:
            break
        lines.append(line)
    return "\n".join(lines)


def save_call(call: SalesCall) -> None:
    DATA_DIR.mkdir(exist_ok=True)

    with JSONL_PATH.open("a", encoding="utf-8") as file:
        file.write(json.dumps(asdict(call), ensure_ascii=False) + "\n")

    is_new_csv = not CSV_PATH.exists()
    with CSV_PATH.open("a", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(asdict(call).keys()))
        if is_new_csv:
            writer.writeheader()
        writer.writerow(asdict(call))


def collect_sales_call() -> SalesCall:
    print("WPCRM Sales Call Logger\n")
    contact_name = prompt_required("Contact name: ")
    appointment_type = prompt_appointment_type()
    appointment_datetime = prompt_datetime()
    meeting_point = prompt_required("\nPoint of the meeting: ")
    actions = prompt_multiline("\nSpecific actions and/or to-do items:")
    recorded_at = datetime.now().replace(microsecond=0).isoformat(sep=" ")

    return SalesCall(
        contact_name=contact_name,
        appointment_type=appointment_type,
        appointment_datetime=appointment_datetime,
        meeting_point=meeting_point,
        actions=actions,
        recorded_at=recorded_at,
    )


def main() -> None:
    call = collect_sales_call()

    print("\nReview:")
    print(f"Contact: {call.contact_name}")
    print(f"Appointment type: {call.appointment_type}")
    print(f"Date/time: {call.appointment_datetime}")
    print(f"Point: {call.meeting_point}")
    print("Actions:")
    print(call.actions or "(none)")

    confirm = input("\nSave this entry? [Y/n]: ").strip().lower()
    if confirm in {"", "y", "yes"}:
        save_call(call)
        print(f"\nSaved to {JSONL_PATH} and {CSV_PATH}.")
    else:
        print("\nEntry discarded.")


if __name__ == "__main__":
    main()
