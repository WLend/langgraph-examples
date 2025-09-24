# README: 03-advanced-graph.js - Пошаговое выполнение кода

## Обзор
Этот файл демонстрирует продвинутый граф с множественными узлами, сложной архитектурой, retry логикой, мониторингом и различными стратегиями fallback.

## Пошаговое выполнение кода

### Шаг 1: Сложное состояние (строки 28-64)
```javascript
const AdvancedGraphState = z.object({
  // Основные поля
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  
  // Анализ запроса
  queryType: z.string().default(""),
  queryComplexity: z.number().default(0), // 1-10
  language: z.string().default("ru"),
  domain: z.string().default(""), // tech, science, business
  
  // Обработка
  processingStage: z.string().default(""), // validation, analysis, generation
  confidence: z.number().default(0),
  quality: z.number().default(0), // Качество ответа 1-10
  
  // Ошибки и retry
  error: z.string().nullable().default(null),
  errorType: z.string().default(""), // network, api, validation, timeout
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3),
  
  // Fallback
  fallbackUsed: z.boolean().default(false),
  fallbackType: z.string().default(""), // simple, cached, manual
  fallbackReason: z.string().default(""),
  
  // Мониторинг
  startTime: z.number().default(0),
  endTime: z.number().default(0),
  processingTime: z.number().default(0),
  tokensUsed: z.number().default(0),
  
  metadata: z.record(z.any()).default({})
});
```

**Что происходит:**
- Создается сложная схема состояния с множественными полями
- Добавляются поля для анализа, мониторинга, retry и fallback
- Определяются типы данных для каждого поля

### Шаг 2: Узел анализа запроса (строки 71-119)
```javascript
async function analyzeQuery(state) {
  const query = state.userQuery.toLowerCase();
  
  // Определяем сложность (1-10)
  let complexity = 1;
  if (query.length > 200) complexity += 2;
  if (query.includes("анализ") || query.includes("сравни")) complexity += 2;
  if (query.includes("объясни подробно")) complexity += 3;
  if (query.includes("научный") || query.includes("исследование")) complexity += 2;
  
  // Определяем домен
  let domain = "general";
  if (query.includes("программирование") || query.includes("код")) {
    domain = "tech";
  } else if (query.includes("наука") || query.includes("исследование")) {
    domain = "science";
  } else if (query.includes("бизнес") || query.includes("экономика")) {
    domain = "business";
  }
  
  // Определяем тип запроса
  let queryType = "general";
  if (query.includes("что такое") || query.includes("кто такой")) {
    queryType = "definition";
  } else if (query.includes("как") || query.includes("почему")) {
    queryType = "explanation";
  } else if (query.includes("сравни") || query.includes("разница")) {
    queryType = "comparison";
  } else if (query.includes("анализ") || query.includes("исследование")) {
    queryType = "analysis";
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
3. **Определение типа:** Классифицируется тип запроса (definition, explanation, comparison, analysis)
4. **Обновление состояния:** Устанавливается processingStage: "analysis"

### Шаг 3: Узел выбора стратегии (строки 124-168)
```javascript
async function selectProcessingStrategy(state) {
  const { queryComplexity, domain, queryType } = state;
  
  // Простые запросы - быстрая обработка
  if (queryComplexity <= 3 && queryType === "definition") {
    return {
      ...state,
      processingStage: "fast_processing",
      metadata: { ...state.metadata, strategy: "fast" }
    };
  }
  
  // Сложные запросы - детальная обработка
  if (queryComplexity >= 7 || queryType === "analysis") {
    return {
      ...state,
      processingStage: "detailed_processing",
      metadata: { ...state.metadata, strategy: "detailed" }
    };
  }
  
  // Обычные запросы - стандартная обработка
  return {
    ...state,
    processingStage: "standard_processing",
    metadata: { ...state.metadata, strategy: "standard" }
  };
}
```

**Что происходит:**
1. **Анализ параметров:** Анализируются complexity, domain, queryType
2. **Выбор стратегии:** Выбирается стратегия обработки на основе анализа
3. **Установка стадии:** Устанавливается processingStage для следующего узла

### Шаг 4: Быстрая обработка (строки 173-219)
```javascript
async function fastProcessing(state) {
  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.3, // Низкая температура для точности
    maxTokens: 200,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Дай краткий и точный ответ на русском языке. Максимум 1-2 предложения."],
    ["human", "{query}"]
  ]);
  
  try {
    const chain = prompt.pipe(model);
    const result = await chain.invoke({ query: state.userQuery });
    
    return {
      ...state,
      response: result.content,
      messages: [...state.messages, userMessage, aiMessage],
      confidence: 0.9,
      quality: 8,
      processingStage: "completed",
      metadata: { ...state.metadata, processor: "fast" }
    };
  } catch (error) {
    return {
      ...state,
      error: error.message,
      errorType: "api",
      processingStage: "error"
    };
  }
}
```

**Что происходит:**
1. **Создание модели:** Инициализируется модель с низкой температурой
2. **Создание промпта:** Создается промпт для кратких ответов
3. **Выполнение запроса:** Обрабатывается запрос через API
4. **Обработка результата:** Устанавливается высокое качество и уверенность
5. **Обработка ошибок:** В случае ошибки устанавливается errorType: "api"

### Шаг 5: Детальная обработка (строки 224-274)
```javascript
async function detailedProcessing(state) {
  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.7, // Высокая температура для креативности
    maxTokens: 1000,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  
  const systemPrompt = `Ты эксперт в области ${state.domain}. 
  Проведи детальный анализ и дай развернутый ответ на русском языке.
  Используй актуальную информацию и предоставь структурированный ответ.`;
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["human", "{query}"]
  ]);
  
  // Аналогично быстрой обработке, но с другими параметрами
}
```

**Что происходит:**
- Аналогично быстрой обработке, но с другими параметрами
- Используется более высокая температура и больше токенов
- Промпт адаптируется под домен запроса

### Шаг 6: Стандартная обработка (строки 279-325)
```javascript
async function standardProcessing(state) {
  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.5, // Средняя температура
    maxTokens: 500,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
  
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "Дай информативный ответ на русском языке. Будь точным и полезным."],
    ["human", "{query}"]
  ]);
  
  // Аналогично другим процессорам
}
```

**Что происходит:**
- Средние параметры между быстрой и детальной обработкой
- Универсальный промпт для обычных запросов

### Шаг 7: Узел проверки качества (строки 330-363)
```javascript
async function qualityCheck(state) {
  const { response, queryComplexity } = state;
  
  // Простая проверка качества
  let quality = 5;
  
  if (response.length < 50) {
    quality = 3; // Слишком короткий
  } else if (response.length > 1000) {
    quality = 8; // Детальный ответ
  } else {
    quality = 6; // Средний ответ
  }
  
  // Учитываем сложность запроса
  if (queryComplexity >= 7 && response.length < 200) {
    quality = Math.max(quality - 2, 1); // Снижаем качество для сложных запросов
  }
  
  return {
    ...state,
    quality,
    processingStage: "quality_checked",
    metadata: { ...state.metadata, qualityScore: quality }
  };
}
```

**Что происходит:**
1. **Анализ длины ответа:** Оценивается качество по длине ответа
2. **Учет сложности:** Корректируется качество с учетом сложности запроса
3. **Обновление состояния:** Устанавливается quality и processingStage

### Шаг 8: Узел retry логики (строки 368-411)
```javascript
async function retryLogic(state) {
  const { retryCount, maxRetries, error, quality } = state;
  
  // Если есть ошибка и не превышен лимит retry
  if (error && retryCount < maxRetries) {
    return {
      ...state,
      retryCount: retryCount + 1,
      error: null,
      processingStage: "retry",
      metadata: { ...state.metadata, retryCount: retryCount + 1 }
    };
  }
  
  // Если качество низкое и есть попытки
  if (quality < 5 && retryCount < maxRetries) {
    return {
      ...state,
      retryCount: retryCount + 1,
      processingStage: "retry",
      metadata: { ...state.metadata, retryReason: "low_quality" }
    };
  }
  
  return { ...state, processingStage: "no_retry_needed" };
}
```

**Что происходит:**
1. **Проверка ошибок:** Если есть ошибка и не превышен лимит, увеличиваем retryCount
2. **Проверка качества:** Если качество низкое и есть попытки, планируем retry
3. **Обновление состояния:** Устанавливается processingStage для следующего шага

### Шаг 9: Fallback узел (строки 416-450)
```javascript
async function fallbackProcessing(state) {
  const fallbackResponse = `Извините, у меня возникли проблемы с обработкой вашего запроса: "${state.userQuery}".

Возможные причины:
- Проблемы с подключением к API
- Слишком сложный запрос
- Превышен лимит попыток

Попробуйте:
1. Переформулировать вопрос
2. Разбить сложный запрос на части
3. Обратиться к технической поддержке`;

  return {
    ...state,
    response: fallbackResponse,
    messages: [...state.messages, userMessage, aiMessage],
    fallbackUsed: true,
    fallbackType: "manual",
    fallbackReason: state.error || "quality_issue",
    confidence: 0.3,
    quality: 4,
    processingStage: "fallback_completed"
  };
}
```

**Что происходит:**
1. **Создание fallback ответа:** Формируется детальное сообщение об ошибке
2. **Создание сообщений:** Создаются HumanMessage и AIMessage
3. **Обновление состояния:** Устанавливаются fallback флаги и низкие метрики

### Шаг 10: Функция принятия решений (строки 455-502)
```javascript
function decideNextStep(state) {
  const { processingStage, error, retryCount, maxRetries, quality } = state;
  
  // Если анализ завершен, выбираем стратегию
  if (processingStage === "analysis") {
    return "select_strategy";
  }
  
  // Если стратегия выбрана, обрабатываем
  if (processingStage === "fast_processing") {
    return "fast_processing";
  }
  if (processingStage === "detailed_processing") {
    return "detailed_processing";
  }
  if (processingStage === "standard_processing") {
    return "standard_processing";
  }
  
  // Если обработка завершена, проверяем качество
  if (processingStage === "completed") {
    return "quality_check";
  }
  
  // Если нужен retry
  if (processingStage === "retry") {
    return "select_strategy";
  }
  
  // Если нужен fallback
  if (error && retryCount >= maxRetries) {
    return "fallback";
  }
  
  if (quality < 5 && retryCount >= maxRetries) {
    return "fallback";
  }
  
  // Если все хорошо, завершаем
  if (processingStage === "quality_checked" && quality >= 5) {
    return "end";
  }
  
  return "retry_logic";
}
```

**Что происходит:**
1. **Анализ стадии:** Анализируется текущая стадия обработки
2. **Выбор следующего шага:** Выбирается следующий узел на основе стадии
3. **Проверка условий:** Проверяются условия для retry и fallback
4. **Возврат решения:** Возвращается название следующего узла

### Шаг 11: Создание сложного графа (строки 528-585)
```javascript
const workflow = new StateGraph(AdvancedGraphState)
  .addNode("analyze", analyzeQuery)
  .addNode("select_strategy", selectProcessingStrategy)
  .addNode("fast_processing", fastProcessing)
  .addNode("detailed_processing", detailedProcessing)
  .addNode("standard_processing", standardProcessing)
  .addNode("quality_check", qualityCheck)
  .addNode("retry_logic", retryLogic)
  .addNode("fallback", fallbackProcessing)
  .addNode("decide", decideNode)
  
  .addEdge(START, "analyze")
  .addEdge("analyze", "select_strategy")
  .addEdge("select_strategy", "decide")
  
  .addConditionalEdges(
    "decide",
    (state) => {
      if (state.processingStage === "decision_made") {
        const previousStage = state.metadata?.previousStage || "analysis";
        const tempState = { ...state, processingStage: previousStage };
        return decideNextStep(tempState);
      }
      return decideNextStep(state);
    },
    {
      select_strategy: "select_strategy",
      fast_processing: "fast_processing",
      detailed_processing: "detailed_processing",
      standard_processing: "standard_processing",
      quality_check: "quality_check",
      retry_logic: "retry_logic",
      fallback: "fallback",
      end: END
    }
  )
  
  .addEdge("fast_processing", "decide")
  .addEdge("detailed_processing", "decide")
  .addEdge("standard_processing", "decide")
  .addEdge("quality_check", "decide")
  .addEdge("retry_logic", "decide")
  .addEdge("fallback", END);
```

**Что происходит:**
1. **Добавление узлов:** Регистрируются все узлы графа
2. **Начальные переходы:** START → analyze → select_strategy → decide
3. **Условные переходы:** От decide к разным узлам на основе решения
4. **Обратные переходы:** От процессоров обратно к decide
5. **Завершающие переходы:** От fallback к END

### Шаг 12: Компиляция и запуск (строки 590-650)
```javascript
const app = workflow.compile();

async function runAdvancedGraph(query) {
  const startTime = Date.now();
  
  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    queryType: "",
    queryComplexity: 0,
    language: "ru",
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
    startTime,
    endTime: 0,
    processingTime: 0,
    tokensUsed: 0,
    metadata: { startedAt: new Date().toISOString() }
  };
  
  const result = await app.invoke(initialState);
  
  const endTime = Date.now();
  const processingTime = endTime - startTime;
  
  return {
    ...result,
    endTime,
    processingTime,
    metadata: { ...result.metadata, totalProcessingTime: processingTime }
  };
}
```

**Что происходит:**
1. **Компиляция графа:** Граф компилируется в исполняемый объект
2. **Создание начального состояния:** Формируется состояние с начальными значениями
3. **Выполнение графа:** Вызывается app.invoke(initialState)
4. **Расчет времени:** Вычисляется время обработки
5. **Возврат результата:** Возвращается финальное состояние с метриками

## Поток выполнения данных

```
1. main() → создает тестовые запросы
2. runAdvancedGraph(query) → создает initialState
3. app.invoke(initialState) → запускает граф
4. START → analyze → analyzeQuery(state)
5. analyze → select_strategy → selectProcessingStrategy(state)
6. select_strategy → decide → decideNode(state)
7. decide → fast_processing/detailed_processing/standard_processing (условно)
8. process_* → decide → decideNextStep(state)
9. decide → quality_check → qualityCheck(state)
10. quality_check → decide → decideNextStep(state)
11. decide → retry_logic/fallback/end (условно)
12. retry_logic → decide → decideNextStep(state)
13. fallback → END
```

## Ключевые особенности

1. **Множественные узлы:** 9 различных узлов для разных задач
2. **Сложная логика:** Условные переходы на основе множества параметров
3. **Retry механизм:** Автоматические повторные попытки при ошибках
4. **Quality control:** Проверка качества ответов
5. **Мониторинг:** Отслеживание времени, токенов, метрик
6. **Fallback стратегии:** Различные уровни fallback
7. **Адаптивность:** Выбор стратегии на основе анализа запроса

## Структура состояния

**Входное состояние:**
```javascript
{
  userQuery: "Проведи анализ ИИ",
  response: "",
  messages: [],
  queryType: "",
  queryComplexity: 0,
  domain: "",
  processingStage: "",
  confidence: 0,
  quality: 0,
  error: null,
  retryCount: 0,
  fallbackUsed: false,
  startTime: 1704067200000,
  metadata: { startedAt: "2024-01-01T10:00:00.000Z" }
}
```

**Промежуточное состояние (после анализа):**
```javascript
{
  userQuery: "Проведи анализ ИИ",
  queryType: "analysis",
  queryComplexity: 7,
  domain: "tech",
  processingStage: "analysis",
  // ... остальные поля
}
```

**Выходное состояние:**
```javascript
{
  userQuery: "Проведи анализ ИИ",
  response: "Детальный анализ ИИ...",
  messages: [HumanMessage, AIMessage],
  queryType: "analysis",
  queryComplexity: 7,
  domain: "tech",
  processingStage: "quality_checked",
  confidence: 0.85,
  quality: 9,
  processingTime: 2500,
  tokensUsed: 150,
  // ... остальные поля
}
```
