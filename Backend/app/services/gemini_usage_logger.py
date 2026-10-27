from itertools import count


_gemini_call_counter = count(1)


def log_gemini_call(call_type: str, model: str) -> None:
    call_number = next(_gemini_call_counter)

    print(
        f"[Gemini API] call #{call_number}: {call_type} ({model})",
        flush=True,
    )
