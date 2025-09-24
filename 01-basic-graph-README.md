# README: 01-basic-graph.js - Пошаговое выполнение кода

## Обзор
Этот файл демонстрирует базовую работу с LangGraph - создание простого графа с одним узлом обработки пользовательских запросов через Perplexity API.

## Пошаговое выполнение кода

### Шаг 1: Импорты и инициализация (строки 13-21)
```javascript
import { StateGraph, END, START } from "@langchain/langgraph";
import { ChatPerplexity } from "@langchain/community/chat_models/perplexity";
// ... другие импорты
dotenv.config();
```

**Что происходит:**
- Импортируются необходимые компоненты LangGraph
- Загружаются переменные окружения из .env файла
- Подготавливается окружение для работы с API

### Шаг 2: Определение схемы состояния (строки 68-80)
```javascript
const BasicGraphState = z.object({
  userQuery: z.string().default(""),
  response: z.string().default(""),
  messages: z.array(z.any()).default([]),
  metadata: z.record(z.any()).default({})
});
```

**Что происходит:**
- Создается Zod схема для валидации состояния графа
- Определяются 4 поля состояния:
  - `userQuery` - входящий запрос пользователя (строка)
  - `response` - ответ от AI (строка)
  - `messages` - массив сообщений для истории
  - `metadata` - объект с метаданными

### Шаг 3: Создание узла обработки (строки 88-147)
```javascript
async function processUserQuery(state) {
  // Создание модели ChatPerplexity
  const model = new ChatPerplexity({
    model: "sonar-pro",
    temperature: 0.7,
    maxTokens: 500,
    apiKey: process.env.PERPLEXITY_API_KEY,
  });
```

**Что происходит:**
1. **Входные параметры:** Функция принимает объект `state` с полями из `BasicGraphState`
2. **Создание модели:** Инициализируется ChatPerplexity с параметрами:
   - `model: "sonar-pro"` - модель для обработки
   - `temperature: 0.7` - креативность ответов
   - `maxTokens: 500` - максимальная длина ответа
   - `apiKey` - ключ API из переменных окружения

### Шаг 4: Создание промпта (строки 100-103)
```javascript
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "Ты полезный AI-ассистент. Отвечай кратко и по делу на русском языке."],
  ["human", "{query}"]
]);
```

**Что происходит:**
- Создается шаблон промпта с системным сообщением
- Определяется место для вставки пользовательского запроса `{query}`

### Шаг 5: Выполнение запроса (строки 105-130)
```javascript
const chain = prompt.pipe(model);
const result = await chain.invoke({ 
  query: state.userQuery 
});
```

**Что происходит:**
1. **Создание цепочки:** Промпт подключается к модели через `pipe()`
2. **Выполнение:** Цепочка вызывается с параметром `query: state.userQuery`
3. **Получение результата:** AI обрабатывает запрос и возвращает ответ

### Шаг 6: Обработка результата (строки 114-130)
```javascript
const userMessage = new HumanMessage(state.userQuery);
const aiMessage = new AIMessage(result.content);

return {
  userQuery: state.userQuery,
  response: result.content,
  messages: [userMessage, aiMessage],
  metadata: {
    ...state.metadata,
    processedAt: new Date().toISOString(),
    model: "sonar-pro"
  }
};
```

**Что происходит:**
1. **Создание сообщений:** Формируются объекты HumanMessage и AIMessage
2. **Возврат состояния:** Обновляется состояние графа:
   - `userQuery` - остается без изменений
   - `response` - заполняется ответом от AI
   - `messages` - добавляются новые сообщения
   - `metadata` - обновляется с временными метками

### Шаг 7: Создание графа (строки 157-165)
```javascript
const workflow = new StateGraph(BasicGraphState)
  .addNode("process_query", processUserQuery)
  .addEdge(START, "process_query")
  .addEdge("process_query", END);
```

**Что происходит:**
1. **Создание графа:** Инициализируется StateGraph с схемой BasicGraphState
2. **Добавление узла:** Регистрируется узел "process_query" с функцией processUserQuery
3. **Определение переходов:**
   - `START -> process_query` - начальный переход
   - `process_query -> END` - конечный переход

### Шаг 8: Компиляция графа (строка 172)
```javascript
const app = workflow.compile();
```

**Что происходит:**
- Граф компилируется в исполняемый объект
- Создается готовый к использованию граф

### Шаг 9: Функция запуска (строки 177-201)
```javascript
async function runBasicGraph(query) {
  const initialState = {
    userQuery: query,
    response: "",
    messages: [],
    metadata: {
      startedAt: new Date().toISOString()
    }
  };
  
  const result = await app.invoke(initialState);
  return result;
}
```

**Что происходит:**
1. **Создание начального состояния:** Формируется объект с начальными значениями
2. **Выполнение графа:** Вызывается `app.invoke(initialState)`
3. **Возврат результата:** Возвращается финальное состояние

### Шаг 10: Основная функция (строки 206-249)
```javascript
async function main() {
  const testQueries = [
    "Что такое искусственный интеллект?",
    "Расскажи о последних новостях в IT",
    "Объясни простыми словами, что такое блокчейн"
  ];
  
  for (const query of testQueries) {
    const result = await runBasicGraph(query);
    console.log(result.response);
  }
}
```

**Что происходит:**
1. **Проверка API ключа:** Валидация наличия PERPLEXITY_API_KEY
2. **Тестовые запросы:** Определяется массив тестовых вопросов
3. **Цикл обработки:** Каждый запрос обрабатывается через runBasicGraph()
4. **Вывод результатов:** Результаты выводятся в консоль

## Поток выполнения данных

```
1. main() → создает тестовые запросы
2. runBasicGraph(query) → создает initialState
3. app.invoke(initialState) → запускает граф
4. START → process_query → выполняется processUserQuery(state)
5. processUserQuery → создает модель, промпт, выполняет запрос
6. process_query → END → возвращает финальное состояние
7. Результат выводится в консоль
```

## Структура состояния

**Входное состояние:**
```javascript
{
  userQuery: "Что такое ИИ?",
  response: "",
  messages: [],
  metadata: { startedAt: "2024-01-01T10:00:00.000Z" }
}
```

**Выходное состояние:**
```javascript
{
  userQuery: "Что такое ИИ?",
  response: "Искусственный интеллект - это...",
  messages: [HumanMessage, AIMessage],
  metadata: {
    startedAt: "2024-01-01T10:00:00.000Z",
    processedAt: "2024-01-01T10:00:05.000Z",
    model: "sonar-pro"
  }
}
```

## Требования для запуска

1. **Переменные окружения:** Создать .env файл с PERPLEXITY_API_KEY
2. **Зависимости:** Установить пакеты из package.json
3. **API ключ:** Получить ключ от Perplexity API

## Обработка ошибок

- **Отсутствие API ключа:** Выбрасывается ошибка с инструкциями
- **Ошибки API:** Ловится в try-catch, возвращается сообщение об ошибке
- **Ошибки графа:** Логируются в консоль, пробрасываются выше
