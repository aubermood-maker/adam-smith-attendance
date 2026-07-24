"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Step = "lookup" | "welcome" | "register" | "complete";
type Customer = { name: string; phone: string };

const DEMO_CUSTOMERS: Customer[] = [
  { name: "김민준", phone: "01012341234" },
  { name: "이지은", phone: "01098765678" },
];

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

function formatPhone(value: string) {
  const digits = normalizePhone(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export default function Home() {
  const [step, setStep] = useState<Step>("lookup");
  const [digits, setDigits] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [time, setTime] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  function getCustomers() {
    if (typeof window === "undefined") return DEMO_CUSTOMERS;
    const saved = JSON.parse(localStorage.getItem("adam-customers") || "[]") as Customer[];
    return [...DEMO_CUSTOMERS, ...saved];
  }

  function handleLookup(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (digits.length !== 4) {
      setError("휴대폰 번호 뒤 4자리를 입력해주세요.");
      return;
    }
    const found = getCustomers().filter((item) => item.phone.endsWith(digits));
    if (found.length === 1) {
      setCustomer(found[0]);
      setStep("welcome");
      return;
    }
    if (found.length > 1) {
      setError("같은 번호를 사용하는 고객이 있어요. 안내 데스크에 문의해주세요.");
      return;
    }
    setStep("register");
  }

  function completeAttendance(person: Customer) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const key = `adam-attendance-${today}`;
    const records = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    if (!records.includes(person.phone)) {
      localStorage.setItem(key, JSON.stringify([...records, person.phone]));
    }
    setCustomer(person);
    setTime(
      new Intl.DateTimeFormat("ko-KR", {
        hour: "numeric",
        minute: "2-digit",
      }).format(now),
    );
    setStep("complete");
  }

  function handleRegister(event: FormEvent) {
    event.preventDefault();
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
    const exists = getCustomers().some((item) => item.phone === normalized);
    if (exists) {
      setError("이미 등록된 번호입니다. 처음 화면에서 다시 조회해주세요.");
      return;
    }
    const newCustomer = { name: name.trim(), phone: normalized };
    const saved = JSON.parse(localStorage.getItem("adam-customers") || "[]") as Customer[];
    localStorage.setItem("adam-customers", JSON.stringify([...saved, newCustomer]));
    completeAttendance(newCustomer);
  }

  function reset() {
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
        <span>ADAM SMITH</span>
        <span className="brandDivider" />
        <span className="brandKo">애덤스미스 출석</span>
      </div>

      <section className="card" aria-live="polite">
        {step === "lookup" && (
          <>
            <div className="eyebrow"><span /> CHECK-IN</div>
            <h1>반갑습니다.<br />출석을 시작할게요.</h1>
            <p className="description">등록된 휴대폰 번호의<br className="mobileBreak" /> 뒤 4자리를 입력해주세요.</p>
            <form onSubmit={handleLookup}>
              <label className="fieldLabel" htmlFor="digits">휴대폰 번호 뒤 4자리</label>
              <div className="digitField">
                <span>••• ••••</span>
                <input
                  ref={inputRef}
                  id="digits"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={digits}
                  onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))}
                  placeholder="0000"
                  aria-describedby={error ? "form-error" : undefined}
                />
              </div>
              {error && <p className="error" id="form-error">{error}</p>}
              <button className="primary" type="submit" disabled={digits.length !== 4}>
                고객 조회하기 <span aria-hidden="true">→</span>
              </button>
            </form>
            <div className="help"><span>i</span> 처음 방문하셨나요? 번호 조회 후 바로 등록할 수 있어요.</div>
            <p className="demo">화면 체험용 등록 번호 · 1234</p>
          </>
        )}

        {step === "welcome" && customer && (
          <div className="centered">
            <div className="personIcon" aria-hidden="true">✓</div>
            <div className="eyebrow centeredEyebrow"><span /> MEMBER FOUND <span /></div>
            <h1>{customer.name} 님,<br />어서 오세요.</h1>
            <p className="description">아래 버튼을 누르면<br />오늘의 출석이 기록됩니다.</p>
            <button className="primary" onClick={() => completeAttendance(customer)}>
              참석하기 <span aria-hidden="true">→</span>
            </button>
            <button className="textButton" onClick={reset}>다른 번호로 조회</button>
          </div>
        )}

        {step === "register" && (
          <>
            <button className="back" onClick={reset} aria-label="이전 화면">←</button>
            <div className="eyebrow"><span /> FIRST VISIT</div>
            <h1>처음 오셨군요.<br />정보를 등록해주세요.</h1>
            <p className="description">등록과 동시에 오늘 출석이 완료됩니다.</p>
            <form className="registerForm" onSubmit={handleRegister}>
              <label className="fieldLabel" htmlFor="name">성함</label>
              <input
                ref={inputRef}
                className="lineInput"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                autoComplete="name"
              />
              <label className="fieldLabel" htmlFor="phone">휴대폰 번호</label>
              <input
                className="lineInput"
                id="phone"
                inputMode="numeric"
                value={formatPhone(phone)}
                onChange={(e) => setPhone(normalizePhone(e.target.value))}
                placeholder="010-0000-0000"
                autoComplete="tel"
              />
              <label className="check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>개인정보 수집 및 이용에 동의합니다.</span>
              </label>
              {error && <p className="error">{error}</p>}
              <button className="primary" type="submit">등록하고 참석하기 <span aria-hidden="true">→</span></button>
            </form>
          </>
        )}

        {step === "complete" && customer && (
          <div className="centered complete">
            <div className="successRing"><span>✓</span></div>
            <div className="eyebrow centeredEyebrow"><span /> CHECK-IN COMPLETE <span /></div>
            <h1>출석이<br />완료되었습니다.</h1>
            <p className="description"><strong>{customer.name}</strong> 님, 오늘도 좋은 시간 보내세요.</p>
            <div className="receipt">
              <span>오늘의 출석 시간</span>
              <strong>{time}</strong>
            </div>
            <button className="primary" onClick={reset}>처음 화면으로</button>
            <p className="autoGuide">다음 고객을 위해 처음 화면으로 돌아가주세요.</p>
          </div>
        )}
      </section>

      <footer>
        <span className="statusDot" /> 안전하게 출석 정보를 기록하고 있어요
      </footer>
    </main>
  );
}
