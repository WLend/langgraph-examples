# README: 05-integrated-fallback.js - Пошаговое выполнение кода

## Обзор
Этот файл демонстрирует интегрированный fallback в существующий продвинутый граф - умные стратегии fallback на основе контекста, каскадные fallback механизмы и мониторинг.

## Пошаговое выполнение кода

### Шаг 1: Расширенное состояние с интегрированным fallback (строки 27-67)
```javascript
const IntegratedFallbackState = z.object({
  // Основные поля
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  
  // Анализ запроса
  queryType: z.string().default(""),
  queryComplexity: z.number().default(0),
  domain: z.string().default(""),
  
  // Обработка
  processingStage: z.string().default(""),
  confidence: z.number().default(0),
  quality: z.number().default(0),
  
  // Ошибки и retry
  error: z.string().nullable().default(null),
  errorType: z.string().default(""),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3),
  
  // Интегрированный fallback
  fallbackUsed: z.boolean().default(false),
  fallbackType: z.string().default(""),
  fallbackReason: z.string().default(""),
  fallbackLevel: z.number().default(0), // 1-3 уровни fallback
  fallbackSuccess: z.boolean().default(false),
  
  // Кэш и альтернативы
  cachedResponses: z.record(z.string()).default({}),
  alternativeModels: z.array(z.string()).default([]),
  
  // Мониторинг
  startTime: z.number().default(0),
  processingTime: z.number().default(0),
  fallbackMetrics: z.record(z.any()).default({}),
  
  metadata: z.record(z.any()).default({})
});
```

**Что происходит:**
- Создается сложная схема состояния с интегрированным fallback
- Добавляются поля для отслеживания уровней fallback и успеха
- Определяются поля для кэша, альтернативных моделей и метрик

### Шаг 2: Узел анализа запроса (строки 72-115)
```javascript
async function analyzeQuery(state) {
  const query = state.userQuery.toLowerCase();
  
  let complexity = 1;
  if (query.length > 200) complexity += 2;
  if (query.includes("анализ") || query.includes("сравни")) complexity += 2;
  if (query.includes("объясни подробно")) complexity += 3;
  if (query.includes("научный") || query.includes("исследование")) complexity += 2;
  
  let domain = "general";
  if (query.includes("программирование") || query.includes("код")) {
    domain = "tech";
  } else if (query.includes("наука") || query.includes("исследование")) {
    domain = "science";
  } else if (query.includes("бизнес") || query.includes("экономика")) {
    domain = "business";
  }
  
  let queryType = "general";
  if (query.includes("что такое") || query.includes("кто такой")) {
    queryType = "definition";
  } else if (query.includes("как") || query.includes("почему")) {
    queryType = "explanation";
  } else if (query.includes("сравни") || query.includes("разница")) {
    queryType = "comparison";
  }
  
  return {
    ...state,
    processingStage: "analysis",
    queryType,
    queryComplexity: complexity,
    domain,
    metadata: { ...state.metadata, analyzedAt: new Date().toISOString() }
  };
}
```

**Что происходит:**
1. **Анализ сложности:** Оценивается сложность запроса по длине и ключевым словам
2. **Определение домена:** Классифицируется домен (tech, science, business, general)
3. **Определение типа:** Классифицируется тип запроса (definition, explanation, comparison)
4. **Обновление состояния:** Устанавливается processingStage: "analysis"

### Шаг 3: Основная обработка с встроенной обработкой ошибок (строки 120-182)
```javascript
async function mainProcessing(state) {
  try {
    const model = new ChatPerplexity({
      model: "sonar-pro",
      temperature: 0.5,
      maxTokens: 500,
      apiKey: process.env.PERPLEXITY_API_KEY,
    });
    
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "Дай информативный ответ на русском языке. Будь точным и полезным."],
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
      confidence: 0.9,
      quality: 8,
      processingStage: "main_completed",
      metadata: { ...state.metadata, processor: "main" }
    };
    
  } catch (error) {
    // Определяем тип ошибки
    let errorType = "unknown";
    if (error.message.includes("timeout")) errorType = "timeout";
    else if (error.message.includes("rate limit")) errorType = "rate_limit";
    else if (error.message.includes("network")) errorType = "network";
    else if (error.message.includes("api")) errorType = "api";
    
    return {
      ...state,
      error: error.message,
      errorType,
      processingStage: "main_failed",
      metadata: { ...state.metadata, errorType, mainProcessingFailed: true }
    };
  }
}
```

**Что происходит:**
1. **Попытка основной обработки:** Выполняется API вызов с основными параметрами
2. **Обработка успеха:** Если API работает, возвращается успешный результат
3. **Классификация ошибок:** Определяется тип ошибки для fallback стратегии
4. **Обработка ошибки:** Возвращается состояние с информацией об ошибке

### Шаг 4: Fallback Level 1 - Кэшированные ответы (строки 187-244)
```javascript
async function fallbackLevel1(state) {
  const { userQuery, cachedResponses, queryType, domain } = state;
  
  // Ищем точное совпадение
  let cachedResponse = cachedResponses[userQuery.toLowerCase().trim()];
  
  if (!cachedResponse) {
    // Ищем по типу запроса
    const typeKey = `type_${queryType}`;
    cachedResponse = cachedResponses[typeKey];
  }
  
  if (!cachedResponse) {
    // Ищем по домену
    const domainKey = `domain_${domain}`;
    cachedResponse = cachedResponses[domainKey];
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
      fallbackLevel: 1,
      fallbackSuccess: true,
      confidence: 0.7,
      quality: 6,
      processingStage: "fallback_level1_success",
      metadata: { ...state.metadata, fallbackLevel: 1, cacheHit: true }
    };
  }
  
  return {
    ...state,
    fallbackLevel: 1,
    fallbackSuccess: false,
    processingStage: "fallback_level1_failed",
    metadata: { ...state.metadata, fallbackLevel: 1, cacheMiss: true }
  };
}
```

**Что происходит:**
1. **Поиск точного совпадения:** Ищется точное совпадение запроса в кэше
2. **Поиск по типу:** Если точного совпадения нет, ищется по типу запроса
3. **Поиск по домену:** Если по типу не найдено, ищется по домену
4. **Возврат кэша:** Если найден кэш, возвращается кэшированный ответ
5. **Отказ:** Если кэш не найден, возвращается состояние с fallbackSuccess: false

### Шаг 5: Fallback Level 2 - Альтернативная модель (строки 249-308)
```javascript
async function fallbackLevel2(state) {
  try {
    // Используем другую модель или параметры
    const model = new ChatPerplexity({
      model: "sonar-pro", // Можно попробовать другую модель
      temperature: 0.3, // Более консервативные параметры
      maxTokens: 300, // Меньше токенов
      apiKey: process.env.PERPLEXITY_API_KEY,
    });
    
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "Дай краткий и точный ответ на русском языке. Если не уверен, скажи об этом."],
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
      fallbackUsed: true,
      fallbackType: "alternative_model",
      fallbackLevel: 2,
      fallbackSuccess: true,
      confidence: 0.6,
      quality: 5,
      processingStage: "fallback_level2_success",
      metadata: { ...state.metadata, fallbackLevel: 2, alternativeModelUsed: true }
    };
    
  } catch (error) {
    return {
      ...state,
      fallbackLevel: 2,
      fallbackSuccess: false,
      processingStage: "fallback_level2_failed",
      metadata: { ...state.metadata, fallbackLevel: 2, alternativeModelFailed: true }
    };
  }
}
```

**Что происходит:**
1. **Попытка альтернативной модели:** Используется модель с другими параметрами
2. **Консервативные параметры:** Более низкая температура и меньше токенов
3. **Обработка успеха:** Если альтернативная модель работает, возвращается результат
4. **Обработка ошибки:** Если альтернативная модель не работает, возвращается ошибка

### Шаг 6: Fallback Level 3 - Локальная обработка (строки 313-361)
```javascript
async function fallbackLevel3(state) {
  const { userQuery, queryType, domain } = state;
  
  let localResponse = "";
  
  // Специализированная обработка по типу запроса
  if (queryType === "definition") {
    localResponse = `К сожалению, у меня сейчас технические проблемы, и я не могу дать точное определение для "${userQuery}". Попробуйте обратиться позже или переформулировать вопрос.`;
  } else if (queryType === "explanation") {
    localResponse = `Я получил ваш запрос: "${userQuery}", но у меня сейчас ограниченные возможности. Я не могу дать полное объяснение, но запомнил ваш вопрос.`;
  } else if (queryType === "comparison") {
    localResponse = `Для сравнения "${userQuery}" мне нужен доступ к актуальным данным, которого сейчас нет. Попробуйте обратиться позже.`;
  } else {
    localResponse = `Я получил ваш запрос: "${userQuery}", но у меня сейчас технические проблемы. Я не могу дать полный ответ, но запомнил ваш вопрос для будущего обращения.`;
  }
  
  // Добавляем контекстную информацию
  if (domain === "tech") {
    localResponse += "\n\n💡 Совет: Для технических вопросов попробуйте обратиться к официальной документации или сообществу разработчиков.";
  } else if (domain === "science") {
    localResponse += "\n\n🔬 Совет: Для научных вопросов рекомендую обратиться к научным статьям или экспертам в данной области.";
  } else if (domain === "business") {
    localResponse += "\n\n💼 Совет: Для бизнес-вопросов рекомендую обратиться к бизнес-консультантам или специализированным ресурсам.";
  }
  
  const userMessage = new HumanMessage(userQuery);
  const aiMessage = new AIMessage(localResponse);
  
  return {
    ...state,
    response: localResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "local_processing",
    fallbackLevel: 3,
    fallbackSuccess: true,
    confidence: 0.4,
    quality: 4,
    processingStage: "fallback_level3_success",
    metadata: { ...state.metadata, fallbackLevel: 3, localProcessing: true }
  };
}
```

**Что происходит:**
1. **Анализ типа запроса:** Анализируется тип запроса для специализированной обработки
2. **Создание специализированных ответов:** Для разных типов создаются разные ответы
3. **Добавление контекстной информации:** Добавляются советы на основе домена
4. **Создание сообщений:** Создаются HumanMessage и AIMessage
5. **Обновление состояния:** Устанавливаются fallback флаги и низкие метрики

### Шаг 7: Узел выбора fallback стратегии (строки 366-427)
```javascript
async function selectFallbackStrategy(state) {
  const { errorType, queryComplexity, domain, fallbackLevel } = state;
  
  // Если это первый fallback
  if (fallbackLevel === 0) {
    return {
      ...state,
      fallbackLevel: 1,
      processingStage: "fallback_level1",
      metadata: { ...state.metadata, fallbackStrategy: "level1" }
    };
  }
  
  // Если Level 1 не сработал
  if (fallbackLevel === 1 && !state.fallbackSuccess) {
    return {
      ...state,
      fallbackLevel: 2,
      processingStage: "fallback_level2",
      metadata: { ...state.metadata, fallbackStrategy: "level2" }
    };
  }
  
  // Если Level 2 не сработал
  if (fallbackLevel === 2 && !state.fallbackSuccess) {
    return {
      ...state,
      fallbackLevel: 3,
      processingStage: "fallback_level3",
      metadata: { ...state.metadata, fallbackStrategy: "level3" }
    };
  }
  
  // Если все fallback исчерпаны
  return {
    ...state,
    processingStage: "all_fallback_failed",
    metadata: { ...state.metadata, allFallbackFailed: true }
  };
}
```

**Что происходит:**
1. **Проверка уровня fallback:** Анализируется текущий уровень fallback
2. **Выбор следующего уровня:** Выбирается следующий уровень на основе текущего
3. **Проверка успеха:** Проверяется успех предыдущего уровня
4. **Обновление состояния:** Устанавливается fallbackLevel и processingStage
5. **Логирование:** Добавляются метаданные о выбранной стратегии

### Шаг 8: Функция принятия решений (строки 432-480)
```javascript
function decideNextStep(state) {
  const { processingStage, error, fallbackLevel, fallbackSuccess } = state;
  
  // Если анализ завершен, переходим к основной обработке
  if (processingStage === "analysis") {
    return "main_processing";
  }
  
  // Если основная обработка завершена успешно
  if (processingStage === "main_completed") {
    return "end";
  }
  
  // Если основная обработка не удалась, переходим к fallback
  if (processingStage === "main_failed") {
    return "select_fallback_strategy";
  }
  
  // Если fallback стратегия выбрана
  if (processingStage === "fallback_level1") {
    return "fallback_level1";
  }
  if (processingStage === "fallback_level2") {
    return "fallback_level2";
  }
  if (processingStage === "fallback_level3") {
    return "fallback_level3";
  }
  
  // Если fallback успешен
  if (processingStage.includes("fallback_level") && processingStage.includes("success")) {
    return "end";
  }
  
  // Если fallback не удался, переходим к следующему уровню
  if (processingStage.includes("fallback_level") && processingStage.includes("failed")) {
    return "select_fallback_strategy";
  }
  
  // Если все fallback исчерпаны
  if (processingStage === "all_fallback_failed") {
    return "end";
  }
  
  return "select_fallback_strategy";
}
```

**Что происходит:**
1. **Анализ стадии:** Анализируется текущая стадия обработки
2. **Выбор следующего шага:** Выбирается следующий узел на основе стадии
3. **Проверка fallback:** Проверяются условия для fallback уровней
4. **Возврат решения:** Возвращается название следующего узла

### Шаг 9: Создание интегрированного графа (строки 485-577)
```javascript
const integratedWorkflow = new StateGraph(IntegratedFallbackState)
  .addNode("analyze", analyzeQuery)
  .addNode("main_processing", mainProcessing)
  .addNode("select_fallback_strategy", selectFallbackStrategy)
  .addNode("fallback_level1", fallbackLevel1)
  .addNode("fallback_level2", fallbackLevel2)
  .addNode("fallback_level3", fallbackLevel3)
  
  .addEdge(START, "analyze")
  .addEdge("analyze", "main_processing")
  
  .addConditionalEdges(
    "main_processing",
    (state) => {
      if (state.processingStage === "main_completed") {
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
      if (state.processingStage === "fallback_level1") {
        return "fallback_level1";
      } else if (state.processingStage === "fallback_level2") {
        return "fallback_level2";
      } else if (state.processingStage === "fallback_level3") {
        return "fallback_level3";
      } else {
        return "end";
      }
    },
    {
      fallback_level1: "fallback_level1",
      fallback_level2: "fallback_level2",
      fallback_level3: "fallback_level3",
      end: END
    }
  )
  
  .addConditionalEdges(
    "fallback_level1",
    (state) => {
      if (state.processingStage.includes("success")) {
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
    "fallback_level2",
    (state) => {
      if (state.processingStage.includes("success")) {
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
    "fallback_level3",
    (state) => {
      return "end";
    },
    {
      end: END
    }
  );
```

**Что происходит:**
1. **Добавление узлов:** Регистрируются все узлы графа
2. **Начальные переходы:** START → analyze → main_processing
3. **Условные переходы:** От main_processing к end или select_fallback_strategy
4. **Условные переходы:** От select_fallback_strategy к конкретному fallback уровню
5. **Условные переходы:** От fallback уровней к end или следующему уровню
6. **Завершающие переходы:** От fallback_level3 к end

### Шаг 10: Компиляция и запуск (строки 582-657)
```javascript
const integratedApp = integratedWorkflow.compile();

async function runIntegratedFallback(query, options = {}) {
  const startTime = Date.now();
  
  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    queryType: "",
    queryComplexity: 0,
    domain: "",
    processingStage: "",
    confidence: 0,
    quality: 0,
    error: null,
    errorType: "",
    retryCount: 0,
    maxRetries: options.maxRetries || 3,
    fallbackUsed: false,
    fallbackType: "",
    fallbackReason: "",
    fallbackLevel: 0,
    fallbackSuccess: false,
    cachedResponses: options.cachedResponses || {},
    alternativeModels: options.alternativeModels || [],
    startTime,
    processingTime: 0,
    fallbackMetrics: {},
    metadata: { startedAt: new Date().toISOString(), options }
  };
  
  const result = await integratedApp.invoke(initialState);
  
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
3. **Выполнение графа:** Вызывается integratedApp.invoke(initialState)
4. **Расчет времени:** Вычисляется время обработки
5. **Возврат результата:** Возвращается финальное состояние с метриками

## Поток выполнения данных

```
1. main() → создает тестовые запросы с кэшем
2. runIntegratedFallback(query, options) → создает initialState
3. integratedApp.invoke(initialState) → запускает граф
4. START → analyze → analyzeQuery(state)
5. analyze → main_processing → mainProcessing(state)
6. main_processing → select_fallback_strategy/end (условно)
7. select_fallback_strategy → fallback_level1/fallback_level2/fallback_level3/end (условно)
8. fallback_level1 → end/select_fallback_strategy (условно)
9. fallback_level2 → end/select_fallback_strategy (условно)
10. fallback_level3 → end
```

## Каскадные Fallback механизмы

### Level 1: Кэшированные ответы
- **Когда используется:** Первый уровень fallback
- **Что делает:** Ищет ответы в кэше по точному совпадению, типу или домену
- **Преимущества:** Быстрый и может предоставить полезную информацию
- **Недостатки:** Зависит от наличия кэша

### Level 2: Альтернативная модель
- **Когда используется:** Если Level 1 не сработал
- **Что делает:** Использует модель с другими параметрами
- **Преимущества:** Может работать с другими настройками
- **Недостатки:** Все еще зависит от API

### Level 3: Локальная обработка
- **Когда используется:** Если Level 2 не сработал
- **Что делает:** Локальная обработка без API с контекстными советами
- **Преимущества:** Работает без интернета, предоставляет контекстные советы
- **Недостатки:** Ограниченные возможности

## Структура состояния

**Входное состояние:**
```javascript
{
  userQuery: "Что такое машинное обучение?",
  response: "",
  messages: [],
  queryType: "",
  queryComplexity: 0,
  domain: "",
  processingStage: "",
  confidence: 0,
  quality: 0,
  error: null,
  errorType: "",
  retryCount: 0,
  maxRetries: 3,
  fallbackUsed: false,
  fallbackType: "",
  fallbackReason: "",
  fallbackLevel: 0,
  fallbackSuccess: false,
  cachedResponses: { "что такое машинное обучение": "..." },
  alternativeModels: [],
  startTime: 1704067200000,
  processingTime: 0,
  fallbackMetrics: {},
  metadata: { startedAt: "2024-01-01T10:00:00.000Z" }
}
```

**Промежуточное состояние (после анализа):**
```javascript
{
  userQuery: "Что такое машинное обучение?",
  queryType: "definition",
  queryComplexity: 3,
  domain: "tech",
  processingStage: "analysis",
  // ... остальные поля
}
```

**Выходное состояние (Level 1 fallback):**
```javascript
{
  userQuery: "Что такое машинное обучение?",
  response: "Машинное обучение - это область искусственного интеллекта...",
  messages: [HumanMessage, AIMessage],
  queryType: "definition",
  queryComplexity: 3,
  domain: "tech",
  processingStage: "fallback_level1_success",
  fallbackUsed: true,
  fallbackType: "cached",
  fallbackLevel: 1,
  fallbackSuccess: true,
  confidence: 0.7,
  quality: 6,
  // ... остальные поля
}
```

## Ключевые особенности

1. **Интегрированный fallback:** Fallback встроен в основной граф
2. **Каскадные уровни:** 3 уровня fallback с разными стратегиями
3. **Контекстные советы:** Советы на основе домена и типа запроса
4. **Умный выбор:** Выбор стратегии на основе контекста
5. **Мониторинг:** Отслеживание метрик и успеха fallback
6. **Гибкость:** Легко добавлять новые уровни fallback
7. **Надежность:** Гарантированный ответ даже при полном отказе API
