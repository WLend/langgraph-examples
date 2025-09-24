# README: 04-fallback-example.js - Пошаговое выполнение кода

## Обзор
Этот файл демонстрирует fallback механизм в LangGraph - намеренное создание ошибок, различные стратегии fallback, обработку ошибок и восстановление.

## Пошаговое выполнение кода

### Шаг 1: Состояние с fallback полями (строки 27-53)
```javascript
const FallbackGraphState = z.object({
  // Основные поля
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  
  // Ошибки и fallback
  error: z.string().nullable().default(null),
  errorType: z.string().default(""), // api, timeout, validation, network
  fallbackUsed: z.boolean().default(false),
  fallbackType: z.string().default(""), // simple, cached, alternative
  fallbackReason: z.string().default(""),
  
  // Retry логика
  retryCount: z.number().default(0),
  maxRetries: z.number().default(2),
  
  // Кэш для fallback
  cachedResponses: z.record(z.string()).default({}),
  
  // Мониторинг
  startTime: z.number().default(0),
  processingTime: z.number().default(0),
  
  metadata: z.record(z.any()).default({})
});
```

**Что происходит:**
- Создается схема состояния с полями для fallback механизма
- Добавляются поля для отслеживания ошибок, retry и кэша
- Определяются типы fallback (simple, cached, alternative)

### Шаг 2: Узел намеренного создания ошибки (строки 60-98)
```javascript
async function intentionalErrorNode(state) {
  // Симулируем различные типы ошибок
  const errorTypes = ["api", "timeout", "network", "validation"];
  const randomErrorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
  
  let errorMessage = "";
  
  switch (randomErrorType) {
    case "api":
      errorMessage = "API недоступен: превышен лимит запросов";
      break;
    case "timeout":
      errorMessage = "Превышено время ожидания ответа от API";
      break;
    case "network":
      errorMessage = "Ошибка сети: нет подключения к интернету";
      break;
    case "validation":
      errorMessage = "Ошибка валидации: некорректный формат запроса";
      break;
  }
  
  return {
    ...state,
    error: errorMessage,
    errorType: randomErrorType,
    processingStage: "error_created",
    metadata: {
      ...state.metadata,
      errorCreatedAt: new Date().toISOString(),
      errorType: randomErrorType,
      intentionalError: true
    }
  };
}
```

**Что происходит:**
1. **Случайный выбор ошибки:** Выбирается случайный тип ошибки из списка
2. **Создание сообщения:** Формируется сообщение об ошибке для выбранного типа
3. **Обновление состояния:** Устанавливается error, errorType и processingStage
4. **Логирование:** Добавляется метаданные о созданной ошибке

### Шаг 3: Узел проверки возможности retry (строки 103-132)
```javascript
async function checkRetryPossibility(state) {
  const { retryCount, maxRetries, error } = state;
  
  if (error && retryCount < maxRetries) {
    return {
      ...state,
      retryCount: retryCount + 1,
      processingStage: "retry_attempt",
      metadata: {
        ...state.metadata,
        retryAttempt: retryCount + 1,
        retryAt: new Date().toISOString()
      }
    };
  }
  
  return {
    ...state,
    processingStage: "fallback_needed",
    metadata: {
      ...state.metadata,
      retryExhausted: true,
      fallbackNeededAt: new Date().toISOString()
    }
  };
}
```

**Что происходит:**
1. **Проверка условий retry:** Проверяется наличие ошибки и лимит попыток
2. **Увеличение счетчика:** Если retry возможен, увеличивается retryCount
3. **Установка стадии:** Устанавливается processingStage для следующего шага
4. **Логирование:** Добавляются метаданные о попытке retry

### Шаг 4: Простой fallback (строки 137-168)
```javascript
async function simpleFallback(state) {
  const fallbackResponse = `Извините, у меня возникли технические проблемы с обработкой вашего запроса: "${state.userQuery}".

К сожалению, я не могу дать полный ответ в данный момент из-за ${state.errorType} ошибки.

Пожалуйста, попробуйте:
1. Переформулировать вопрос
2. Обратиться позже
3. Связаться с технической поддержкой

Приносим извинения за неудобства.`;

  const userMessage = new HumanMessage(state.userQuery);
  const aiMessage = new AIMessage(fallbackResponse);
  
  return {
    ...state,
    response: fallbackResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "simple",
    fallbackReason: state.error,
    processingStage: "fallback_completed"
  };
}
```

**Что происходит:**
1. **Создание fallback ответа:** Формируется детальное сообщение об ошибке
2. **Создание сообщений:** Создаются HumanMessage и AIMessage
3. **Обновление состояния:** Устанавливаются fallback флаги и стадия

### Шаг 5: Кэшированный fallback (строки 173-217)
```javascript
async function cachedFallback(state) {
  const { userQuery, cachedResponses } = state;
  
  // Ищем точное совпадение
  const cacheKey = userQuery.toLowerCase().trim();
  let cachedResponse = cachedResponses[cacheKey];
  
  if (!cachedResponse) {
    // Ищем частичные совпадения
    for (const [key, value] of Object.entries(cachedResponses)) {
      if (cacheKey.includes(key) || key.includes(cacheKey)) {
        cachedResponse = value;
        break;
      }
    }
  }
  
  if (cachedResponse) {
    const userMessage = new HumanMessage(userQuery);
    const aiMessage = new AIMessage(cachedResponse);
    
    return {
      ...state,
      response: cachedResponse,
      messages: [...state.messages, userMessage, aiMessage],
      fallbackUsed: true,
      fallbackType: "cached",
      fallbackReason: "cached_response_found",
      processingStage: "fallback_completed",
      metadata: { ...state.metadata, cacheHit: true }
    };
  }
  
  // Если кэш пуст, используем простой fallback
  return simpleFallback(state);
}
```

**Что происходит:**
1. **Поиск в кэше:** Ищется точное совпадение запроса в кэше
2. **Частичный поиск:** Если точного совпадения нет, ищутся частичные совпадения
3. **Возврат кэша:** Если найден кэш, возвращается кэшированный ответ
4. **Fallback на простой:** Если кэш пуст, переходим к простому fallback

### Шаг 6: Альтернативный fallback (строки 222-259)
```javascript
async function alternativeFallback(state) {
  const { userQuery } = state;
  
  // Простая локальная обработка без API
  let localResponse = "";
  
  if (userQuery.toLowerCase().includes("привет") || userQuery.toLowerCase().includes("здравствуй")) {
    localResponse = "Привет! К сожалению, у меня сейчас технические проблемы, но я рад вас видеть!";
  } else if (userQuery.toLowerCase().includes("время") || userQuery.toLowerCase().includes("дата")) {
    const now = new Date();
    localResponse = `Текущее время: ${now.toLocaleString('ru-RU')}. К сожалению, я не могу дать более детальную информацию из-за технических проблем.`;
  } else if (userQuery.toLowerCase().includes("помощь") || userQuery.toLowerCase().includes("help")) {
    localResponse = "Я готов помочь! К сожалению, у меня сейчас ограниченные возможности из-за технических проблем. Попробуйте переформулировать вопрос или обратитесь позже.";
  } else {
    localResponse = `Я получил ваш запрос: "${userQuery}", но у меня сейчас технические проблемы. Я не могу дать полный ответ, но запомнил ваш вопрос для будущего обращения.`;
  }
  
  const userMessage = new HumanMessage(userQuery);
  const aiMessage = new AIMessage(localResponse);
  
  return {
    ...state,
    response: localResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "alternative",
    fallbackReason: "local_processing",
    processingStage: "fallback_completed"
  };
}
```

**Что происходит:**
1. **Анализ запроса:** Анализируется содержимое запроса для локальной обработки
2. **Локальная обработка:** Выполняется простая обработка без API вызовов
3. **Специализированные ответы:** Для разных типов запросов даются разные ответы
4. **Создание сообщений:** Создаются HumanMessage и AIMessage
5. **Обновление состояния:** Устанавливаются fallback флаги

### Шаг 7: Попытка восстановления с API (строки 264-314)
```javascript
async function recoveryAttempt(state) {
  try {
    const model = new ChatPerplexity({
      model: "sonar-pro",
      temperature: 0.3,
      maxTokens: 300,
      apiKey: process.env.PERPLEXITY_API_KEY,
    });
    
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "Дай краткий ответ на русском языке. Если не можешь ответить, скажи об этом честно."],
      ["human", "{query}"]
    ]);
    
    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });
    
    const userMessage = new HumanMessage(state.userQuery);
    const aiMessage = new AIMessage(result.content);
    
    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      error: null,
      processingStage: "recovery_successful",
      metadata: { ...state.metadata, recoverySuccessful: true }
    };
    
  } catch (error) {
    return {
      ...state,
      error: error.message,
      processingStage: "recovery_failed",
      metadata: { ...state.metadata, recoveryError: error.message }
    };
  }
}
```

**Что происходит:**
1. **Попытка API вызова:** Пытается выполнить API вызов с консервативными параметрами
2. **Обработка успеха:** Если API работает, возвращается успешный результат
3. **Обработка ошибки:** Если API не работает, возвращается ошибка
4. **Обновление состояния:** Устанавливается соответствующая стадия обработки

### Шаг 8: Функция выбора fallback стратегии (строки 319-339)
```javascript
function selectFallbackStrategy(state) {
  const { errorType, cachedResponses, userQuery } = state;
  
  // Если есть кэшированные ответы, используем кэшированный fallback
  if (Object.keys(cachedResponses).length > 0) {
    return "cached_fallback";
  }
  
  // Для определенных типов ошибок используем альтернативный fallback
  if (errorType === "network" || errorType === "timeout") {
    return "alternative_fallback";
  }
  
  // По умолчанию - простой fallback
  return "simple_fallback";
}
```

**Что происходит:**
1. **Проверка кэша:** Если есть кэшированные ответы, выбирается кэшированный fallback
2. **Проверка типа ошибки:** Для network/timeout ошибок выбирается альтернативный fallback
3. **Возврат стратегии:** Возвращается название выбранной стратегии

### Шаг 9: Функция принятия решений (строки 344-376)
```javascript
function decideNextStep(state) {
  const { processingStage, error, retryCount, maxRetries } = state;
  
  // Если создана ошибка, проверяем retry
  if (processingStage === "error_created") {
    return "check_retry";
  }
  
  // Если retry возможен, пытаемся восстановиться
  if (processingStage === "retry_attempt") {
    return "recovery_attempt";
  }
  
  // Если нужен fallback, выбираем стратегию
  if (processingStage === "fallback_needed") {
    return "select_fallback_strategy";
  }
  
  // Если восстановление не удалось, переходим к fallback
  if (processingStage === "recovery_failed") {
    return "select_fallback_strategy";
  }
  
  // Если все завершено
  if (processingStage === "fallback_completed" || processingStage === "recovery_successful") {
    return "end";
  }
  
  return "check_retry";
}
```

**Что происходит:**
1. **Анализ стадии:** Анализируется текущая стадия обработки
2. **Выбор следующего шага:** Выбирается следующий узел на основе стадии
3. **Проверка условий:** Проверяются условия для retry и fallback
4. **Возврат решения:** Возвращается название следующего узла

### Шаг 10: Создание графа с fallback (строки 400-465)
```javascript
const fallbackWorkflow = new StateGraph(FallbackGraphState)
  .addNode("intentional_error", intentionalErrorNode)
  .addNode("check_retry", checkRetryPossibility)
  .addNode("recovery_attempt", recoveryAttempt)
  .addNode("select_fallback_strategy", selectFallbackStrategyNode)
  .addNode("simple_fallback", simpleFallback)
  .addNode("cached_fallback", cachedFallback)
  .addNode("alternative_fallback", alternativeFallback)
  
  .addEdge(START, "intentional_error")
  .addEdge("intentional_error", "check_retry")
  
  .addConditionalEdges(
    "check_retry",
    (state) => {
      if (state.processingStage === "retry_attempt") {
        return "recovery_attempt";
      } else {
        return "select_fallback_strategy";
      }
    },
    {
      recovery_attempt: "recovery_attempt",
      select_fallback_strategy: "select_fallback_strategy"
    }
  )
  
  .addConditionalEdges(
    "recovery_attempt",
    (state) => {
      if (state.processingStage === "recovery_successful") {
        return "end";
      } else {
        return "select_fallback_strategy";
      }
    },
    {
      end: END,
      select_fallback_strategy: "select_fallback_strategy"
    }
  )
  
  .addConditionalEdges(
    "select_fallback_strategy",
    (state) => {
      const strategy = state.metadata?.selectedStrategy || "simple_fallback";
      return strategy;
    },
    {
      simple_fallback: "simple_fallback",
      cached_fallback: "cached_fallback",
      alternative_fallback: "alternative_fallback"
    }
  )
  
  .addEdge("simple_fallback", END)
  .addEdge("cached_fallback", END)
  .addEdge("alternative_fallback", END);
```

**Что происходит:**
1. **Добавление узлов:** Регистрируются все узлы графа
2. **Начальные переходы:** START → intentional_error → check_retry
3. **Условные переходы:** От check_retry к recovery_attempt или select_fallback_strategy
4. **Условные переходы:** От recovery_attempt к end или select_fallback_strategy
5. **Условные переходы:** От select_fallback_strategy к конкретному fallback
6. **Завершающие переходы:** От всех fallback к END

### Шаг 11: Компиляция и запуск (строки 470-535)
```javascript
const fallbackApp = fallbackWorkflow.compile();

async function runFallbackExample(query, options = {}) {
  const startTime = Date.now();
  
  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    error: null,
    errorType: "",
    fallbackUsed: false,
    fallbackType: "",
    fallbackReason: "",
    retryCount: 0,
    maxRetries: options.maxRetries || 2,
    cachedResponses: options.cachedResponses || {},
    startTime,
    processingTime: 0,
    metadata: { startedAt: new Date().toISOString(), options }
  };
  
  const result = await fallbackApp.invoke(initialState);
  
  const endTime = Date.now();
  const processingTime = endTime - startTime;
  
  return {
    ...result,
    processingTime,
    metadata: { ...result.metadata, totalProcessingTime: processingTime }
  };
}
```

**Что происходит:**
1. **Компиляция графа:** Граф компилируется в исполняемый объект
2. **Создание начального состояния:** Формируется состояние с начальными значениями
3. **Выполнение графа:** Вызывается fallbackApp.invoke(initialState)
4. **Расчет времени:** Вычисляется время обработки
5. **Возврат результата:** Возвращается финальное состояние с метриками

## Поток выполнения данных

```
1. main() → создает тестовые запросы с кэшем
2. runFallbackExample(query, options) → создает initialState
3. fallbackApp.invoke(initialState) → запускает граф
4. START → intentional_error → intentionalErrorNode(state)
5. intentional_error → check_retry → checkRetryPossibility(state)
6. check_retry → recovery_attempt/select_fallback_strategy (условно)
7. recovery_attempt → end/select_fallback_strategy (условно)
8. select_fallback_strategy → simple_fallback/cached_fallback/alternative_fallback (условно)
9. fallback_* → END
```

## Стратегии Fallback

### 1. Простой Fallback
- **Когда используется:** По умолчанию, когда нет других вариантов
- **Что делает:** Возвращает стандартное сообщение об ошибке
- **Преимущества:** Простой и надежный
- **Недостатки:** Не предоставляет полезной информации

### 2. Кэшированный Fallback
- **Когда используется:** Когда есть кэшированные ответы
- **Что делает:** Ищет похожие запросы в кэше
- **Преимущества:** Быстрый и может предоставить полезную информацию
- **Недостатки:** Зависит от наличия кэша

### 3. Альтернативный Fallback
- **Когда используется:** Для network/timeout ошибок
- **Что делает:** Локальная обработка без API
- **Преимущества:** Работает без интернета
- **Недостатки:** Ограниченные возможности

## Структура состояния

**Входное состояние:**
```javascript
{
  userQuery: "Что такое машинное обучение?",
  response: "",
  messages: [],
  error: null,
  errorType: "",
  fallbackUsed: false,
  fallbackType: "",
  fallbackReason: "",
  retryCount: 0,
  maxRetries: 2,
  cachedResponses: { "что такое машинное обучение": "..." },
  startTime: 1704067200000,
  processingTime: 0,
  metadata: { startedAt: "2024-01-01T10:00:00.000Z" }
}
```

**Промежуточное состояние (после создания ошибки):**
```javascript
{
  userQuery: "Что такое машинное обучение?",
  error: "API недоступен: превышен лимит запросов",
  errorType: "api",
  processingStage: "error_created",
  // ... остальные поля
}
```

**Выходное состояние (кэшированный fallback):**
```javascript
{
  userQuery: "Что такое машинное обучение?",
  response: "Машинное обучение - это область искусственного интеллекта...",
  messages: [HumanMessage, AIMessage],
  fallbackUsed: true,
  fallbackType: "cached",
  fallbackReason: "cached_response_found",
  processingStage: "fallback_completed",
  // ... остальные поля
}
```

## Ключевые особенности

1. **Намеренные ошибки:** Демонстрация различных типов ошибок
2. **Множественные стратегии:** 3 различных стратегии fallback
3. **Retry механизм:** Автоматические повторные попытки
4. **Кэширование:** Использование кэшированных ответов
5. **Локальная обработка:** Обработка без API вызовов
6. **Мониторинг:** Отслеживание времени и метрик
7. **Гибкость:** Легко добавлять новые стратегии fallback
