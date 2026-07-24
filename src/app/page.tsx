"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AttendanceRecord,
  Customer,
  EventItem,
  createAttendanceRecord,
  initializeAttendanceStorage,
  saveAttendanceRecords,
  saveCustomers,
} from "@/lib/attendance-storage";

type Step = "lookup" | "welcome" | "register" | "complete" | "records";

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function playCheckInSound(type: "dingdong" | "beep" | "warning") {
  try {
    const audioContext = new AudioContext();
    const masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);
    masterGain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    const playNote = (
      frequency: number,
      startsAfter: number,
      duration: number,
      oscillatorType: OscillatorType = "sine",
    ) => {
      const oscillator = audioContext.createOscillator();
      const noteGain = audioContext.createGain();
      const startsAt = audioContext.currentTime + startsAfter;
      const endsAt = startsAt + duration;
      oscillator.type = oscillatorType;
      oscillator.frequency.setValueAtTime(frequency, startsAt);
      noteGain.gain.setValueAtTime(0.0001, startsAt);
      noteGain.gain.exponentialRampToValueAtTime(0.24, startsAt + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
      oscillator.connect(noteGain);
      noteGain.connect(masterGain);
      oscillator.start(startsAt);
      oscillator.stop(endsAt);
    };
    masterGain.gain.exponentialRampToValueAtTime(1, audioContext.currentTime + 0.01);
    if (type === "dingdong") {
      playNote(659.25, 0, 0.28);
      playNote(523.25, 0.22, 0.42);
      window.setTimeout(() => void audioContext.close(), 800);
    } else if (type === "warning") {
      playNote(440, 0, 0.14, "triangle");
      playNote(330, 0.16, 0.14, "triangle");
      playNote(440, 0.32, 0.24, "triangle");
      window.setTimeout(() => void audioContext.close(), 700);
    } else {
      playNote(220, 0, 0.22, "square");
      window.setTimeout(() => void audioContext.close(), 400);
    }
  } catch {
    // 출석 기능은 오디오 지원 여부와 관계없이 계속 동작합니다.
  }
}

export default function Home() {
  const [step, setStep] = useState<Step>("lookup");
  const [event, setEvent] = useState<EventItem | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [digits, setDigits] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [time, setTime] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const data = initializeAttendanceStorage();
    setEvent(data.events.find((item) => item.id === data.activeEventId) || null);
    setCustomers(data.customers);
    setAllRecords(data.records);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  function eventCustomers() {
    return customers.filter((item) => item.eventId === event?.id);
  }

  function handleLookup(formEvent: FormEvent) {
    formEvent.preventDefault();
    setError("");
    if (!event) {
      setError("현재 진행 중인 행사가 없습니다. 관리자에게 문의해주세요.");
      return;
    }
    if (digits.length !== 4) {
      setError("휴대폰 번호 뒤 4자리를 입력해주세요.");
      return;
    }
    const found = eventCustomers().filter((item) => item.phone.endsWith(digits));
    if (found.length === 1) {
      setCustomer(found[0]);
      setStep("welcome");
      return;
    }
    if (found.length > 1) {
      setError("같은 번호를 사용하는 고객이 있어요. 안내 데스크에 문의해주세요.");
      return;
    }
    playCheckInSound("beep");
    setStep("register");
  }

  function completeAttendance(person: Customer, playSuccessSound = false) {
    if (!event) return;
    if (playSuccessSound) playCheckInSound(person.isCaution ? "warning" : "dingdong");
    const now = new Date();
    const newRecord = createAttendanceRecord(person, event.name, now);
    const alreadyChecked = allRecords.some(
      (item) =>
        item.eventId === event.id &&
        item.phone === person.phone &&
        item.dateKey === newRecord.dateKey,
    );
    const nextRecords = alreadyChecked ? allRecords : [newRecord, ...allRecords];
    if (!alreadyChecked) {
      setAllRecords(nextRecords);
      saveAttendanceRecords(nextRecords);
    }
    setCustomer(person);
    setTime(new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(now));
    setStep("complete");
  }

  function handleRegister(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!event) return;
    setError("");
    const normalized = normalizePhone(phone);
    if (name.trim().length < 2) {
      setError("성함을 두 글자 이상 입력해주세요.");
      return;
    }
    if (normalized.length !== 11 || !normalized.startsWith("010")) {
      setError("올바른 휴대폰 번호를 입력해주세요.");
      return;
    }
    if (!consent) {
      setError("개인정보 수집 및 이용에 동의해주세요.");
      return;
    }
    if (eventCustomers().some((item) => item.phone === normalized)) {
      setError("현재 행사에 이미 등록된 번호입니다. 처음 화면에서 다시 조회해주세요.");
      return;
    }
    const newCustomer: Customer = {
      eventId: event.id,
      name: name.trim(),
      phone: normalized,
    };
    const nextCustomers = [...customers, newCustomer];
    setCustomers(nextCustomers);
    saveCustomers(nextCustomers);
    completeAttendance(newCustomer);
  }

  function openRecords() {
    if (!event) return;
    setRecords(
      allRecords
        .filter((item) => item.eventId === event.id)
        .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()),
    );
    setStep("records");
  }

  function reset() {
    const data = initializeAttendanceStorage();
    setEvent(data.events.find((item) => item.id === data.activeEventId) || null);
    setCustomers(data.customers);
    setAllRecords(data.records);
    setStep("lookup");
    setDigits("");
    setCustomer(null);
    setName("");
    setPhone("");
    setConsent(false);
    setError("");
  }

  return (
    <main className="shell">
      <div className="brand">
        <div className="mark" aria-hidden="true">A</div>
        <span>ADAM SMITH</span><span className="brandDivider" /><span className="brandKo">애덤스미스 출석</span>
      </div>

      <section className="card" aria-live="polite">
        {step === "lookup" && (
          <>
            <div className="eventPill"><span className="statusDot" /> {event?.name || "진행 행사 없음"}</div>
            <div className="eyebrow"><span /> CHECK-IN</div>
            <h1>반갑습니다.<br />출석을 시작할게요.</h1>
            <p className="description">현재 행사 명단에 등록된<br />휴대폰 번호의 뒤 4자리를 입력해주세요.</p>
            <form onSubmit={handleLookup}>
              <label className="fieldLabel" htmlFor="digits">휴대폰 번호 뒤 4자리</label>
              <div className="digitField">
                <span>••• ••••</span>
                <input ref={inputRef} id="digits" inputMode="numeric" pattern="[0-9]*" maxLength={4} value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))} placeholder="0000" />
              </div>
              {error && <p className="error">{error}</p>}
              <button className="primary" type="submit" disabled={digits.length !== 4 || !event}>고객 조회하기 <span>→</span></button>
            </form>
            <button className="recordsButton" type="button" onClick={openRecords} disabled={!event}>
              <span className="recordsIcon">☷</span>
              <span><strong>현재 행사 출석 기록</strong><small>{event?.name || "행사를 먼저 지정해주세요"}</small></span>
              <span className="recordsArrow">›</span>
            </button>
            <a className="adminLink" href="/admin">관리자 행사·고객 명단 관리</a>
            <div className="help"><span>i</span> 처음 방문하셨나요? 번호 조회 후 현재 행사에 바로 등록할 수 있어요.</div>
          </>
        )}

        {step === "welcome" && customer && (
          <div className="centered">
            <div className="eventPill centeredEventPill">{event?.name}</div>
            <div className="personIcon">✓</div>
            <div className="eyebrow centeredEyebrow"><span /> MEMBER FOUND <span /></div>
            <h1>{customer.name} 님,{customer.isCaution && <span className="cautionBadge welcomeBadge">주의 대상</span>}<br />어서 오세요.</h1>
            <p className="description">아래 버튼을 누르면<br />현재 행사 출석이 기록됩니다.</p>
            <button className="primary" onClick={() => completeAttendance(customer, true)}>참석하기 <span>→</span></button>
            <button className="textButton" onClick={reset}>다른 번호로 조회</button>
          </div>
        )}

        {step === "register" && (
          <>
            <button className="back" onClick={reset}>←</button>
            <div className="eventPill">{event?.name}</div>
            <div className="eyebrow"><span /> FIRST VISIT</div>
            <h1>처음 오셨군요.<br />정보를 등록해주세요.</h1>
            <p className="description">현재 행사 등록과 동시에 출석이 완료됩니다.</p>
            <form className="registerForm" onSubmit={handleRegister}>
              <label className="fieldLabel" htmlFor="name">성함</label>
              <input ref={inputRef} className="lineInput" id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
              <label className="fieldLabel" htmlFor="phone">휴대폰 번호</label>
              <input className="lineInput" id="phone" inputMode="numeric" value={formatPhone(phone)} onChange={(e) => setPhone(normalizePhone(e.target.value))} placeholder="010-0000-0000" />
              <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>개인정보 수집 및 이용에 동의합니다.</span></label>
              {error && <p className="error">{error}</p>}
              <button className="primary" type="submit">등록하고 참석하기 <span>→</span></button>
            </form>
          </>
        )}

        {step === "complete" && customer && (
          <div className="centered complete">
            <div className="eventPill centeredEventPill">{event?.name}</div>
            <div className="successRing"><span>✓</span></div>
            <div className="eyebrow centeredEyebrow"><span /> CHECK-IN COMPLETE <span /></div>
            <h1>출석이<br />완료되었습니다.</h1>
            <p className="description"><strong>{customer.name}</strong> 님, 오늘도 좋은 시간 보내세요.</p>
            <div className="receipt"><span>출석 시간</span><strong>{time}</strong></div>
            <button className="primary" onClick={reset}>처음 화면으로</button>
          </div>
        )}

        {step === "records" && (
          <div className="recordsView">
            <button className="back" onClick={reset}>←</button>
            <div className="eventPill">{event?.name}</div>
            <div className="eyebrow"><span /> EVENT ATTENDANCE</div>
            <div className="recordsHeading"><div><h1>출석 기록</h1><p>현재 행사에 저장된 참석자입니다.</p></div><strong>{records.length}<small>명</small></strong></div>
            {records.length === 0 ? (
              <div className="emptyRecords"><span>☷</span><strong>아직 출석 기록이 없어요.</strong><p>현재 행사 참석자가 이곳에 표시됩니다.</p></div>
            ) : (
              <ul className="recordsList">
                {records.map((record, index) => {
                  const checkedAt = new Date(record.checkedAt);
                  return (
                    <li key={record.id}>
                      <span className="recordNumber">{String(index + 1).padStart(2, "0")}</span>
                      <div className="recordPerson"><strong>{record.name}{record.isCaution && <span className="cautionBadge">주의</span>}</strong><span>{formatPhone(record.phone)}</span></div>
                      <div className="recordTime"><strong>{new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(checkedAt)}</strong><span>{new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(checkedAt)}</span></div>
                    </li>
                  );
                })}
              </ul>
            )}
            <button className="primary recordsHome" onClick={reset}>출석 화면으로 돌아가기</button>
          </div>
        )}
      </section>
      <footer><span className="statusDot" /> 행사별로 안전하게 출석 정보를 기록하고 있어요</footer>
    </main>
  );
}
