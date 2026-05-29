const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const FALLBACK_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
];
const DEFAULT_SYSTEM_PROMPT =
  'Краткий дружелюбный ассистент. Учитывай предыдущие сообщения. Ответ: 1–2 предложения, язык пользователя, без markdown.';

const RETRY_STATUSES = new Set([429, 500, 503]);
const MAX_ATTEMPTS_PER_MODEL = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getModelChain() {
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fromEnv = (process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return [...new Set([primary, ...fromEnv, ...FALLBACK_MODELS])];
}

async function callGeminiModel({ apiKey, model, systemPrompt, contents }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: 120,
        temperature: 0.7,
      },
    }),
  });

  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const err = new Error(`Gemini API error (${response.status})`);
    err.code = 'GEMINI';
    err.status = response.status;
    err.model = model;
    err.retryable = RETRY_STATUSES.has(response.status);
    err.details = raw.slice(0, 500);
    throw err;
  }

  const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!answer) {
    const err = new Error('Empty response from Gemini');
    err.code = 'GEMINI';
    err.model = model;
    err.retryable = true;
    throw err;
  }

  return answer;
}

function buildContents(history, userText) {
  const contents = history.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  }));

  contents.push({ role: 'user', parts: [{ text: userText }] });
  return contents;
}

export async function askGemini(userText, history = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'CONFIG';
    throw err;
  }

  const systemPrompt = process.env.GEMINI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
  const contents = buildContents(history, userText);
  const models = getModelChain();
  const failures = [];
  let lastError;

  for (const model of models) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt += 1) {
      try {
        const answer = await callGeminiModel({ apiKey, model, systemPrompt, contents });
        if (failures.length) {
          console.warn('Gemini recovered after:', failures.join(' → '));
        }
        return answer;
      } catch (e) {
        lastError = e;
        failures.push(`${model}:${e.status || 'err'}`);
        const canRetry = e.retryable && attempt < MAX_ATTEMPTS_PER_MODEL;
        if (!canRetry) break;
        await sleep(500 * attempt);
      }
    }
  }

  console.error('Ask failed:', failures.join(', '));

  if (lastError?.status === 429) {
    lastError.userMessage =
      'Лимит запросов Gemini исчерпан. Подожди минуту или проверь квоту в Google AI Studio.';
  } else if (lastError?.status === 503) {
    lastError.userMessage = 'Сервис перегружен. Нажми Create ещё раз через пару секунд.';
  }

  throw lastError;
}
