import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { NumericFormat } from 'react-number-format';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

dayjs.locale('pt-br');

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const VIEWS = {
  DASHBOARD: 'dashboard',
  TRANSACTIONS: 'transactions',
  CARDS: 'cards'
};

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  label: dayjs().month(index).format('MMMM')
}));

const currentYear = dayjs().year();
const yearOptions = Array.from({ length: 5 }, (_, index) => currentYear - 2 + index);

const categoriesPreset = [
  'Alimentação',
  'Moradia',
  'Transporte',
  'Cartão de Crédito',
  'Lazer',
  'Educação',
  'Saúde',
  'Investimentos',
  'Outros'
];

const colorPalette = [
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#F97316',
  '#10B981',
  '#14B8A6',
  '#0EA5E9',
  '#F59E0B',
  '#EF4444',
  '#22C55E'
];

const formatCurrency = (value = 0) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value) || 0);

const App = () => {
  const [activeView, setActiveView] = useState(VIEWS.DASHBOARD);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().month());
  const [selectedYear, setSelectedYear] = useState(dayjs().year());
  const [transactions, setTransactions] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [transactionForm, setTransactionForm] = useState({
    type: 'expense',
    description: '',
    category: categoriesPreset[0],
    amount: 0,
    date: dayjs().format('YYYY-MM-DD'),
    installments: 1,
    cardId: ''
  });
  const [cardForm, setCardForm] = useState({
    name: '',
    limitValue: 0,
    closingDay: 5,
    dueDay: 15,
    brand: ''
  });

  useEffect(() => {
    const loadInitialData = async () => {
      if (!window.financeApi) {
        setError('A conexão com o processo principal não foi encontrada.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const data = await window.financeApi.getInitialData();
        setTransactions(data.transactions || []);
        setCards(data.cards || []);
      } catch (err) {
        console.error(err);
        setError('Não foi possível carregar os dados iniciais.');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(''), 3500);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const currentMonthTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const date = dayjs(transaction.transaction_date);
      return date.month() === selectedMonth && date.year() === selectedYear;
    });
  }, [transactions, selectedMonth, selectedYear]);

  const totals = useMemo(() => {
    return currentMonthTransactions.reduce(
      (acc, transaction) => {
        const amount = Number(transaction.amount) || 0;
        if (transaction.type === 'income') {
          acc.income += amount;
        } else {
          acc.expense += amount;
        }
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }, [currentMonthTransactions]);

  const balance = totals.income - totals.expense;

  const categoryTotals = useMemo(() => {
    const grouped = {};
    currentMonthTransactions
      .filter((transaction) => transaction.type === 'expense')
      .forEach((transaction) => {
        const key = transaction.category || 'Outros';
        grouped[key] = (grouped[key] || 0) + Number(transaction.amount || 0);
      });
    return Object.entries(grouped)
      .map(([category, value], index) => ({
        category,
        value,
        color: colorPalette[index % colorPalette.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [currentMonthTransactions]);

  const cardUsage = useMemo(() => {
    return cards.map((card) => {
      const totalSpent = currentMonthTransactions
        .filter((transaction) => transaction.type === 'expense' && transaction.card_id === card.id)
        .reduce((acc, transaction) => acc + Number(transaction.amount || 0), 0);
      return {
        ...card,
        totalSpent,
        available: Number(card.limit_value || 0) - totalSpent
      };
    });
  }, [cards, currentMonthTransactions]);

  const topCategory = categoryTotals[0];

  const handleTransactionChange = (field, value) => {
    setTransactionForm((prev) => {
      if (field === 'type' && value === 'income') {
        return {
          ...prev,
          type: value,
          installments: 1,
          cardId: ''
        };
      }
      return {
        ...prev,
        [field]: value
      };
    });
  };

  const handleCardChange = (field, value) => {
    setCardForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const resetTransactionForm = () => {
    setTransactionForm({
      type: 'expense',
      description: '',
      category: categoriesPreset[0],
      amount: 0,
      date: dayjs().format('YYYY-MM-DD'),
      installments: 1,
      cardId: ''
    });
  };

  const resetCardForm = () => {
    setCardForm({
      name: '',
      limitValue: 0,
      closingDay: 5,
      dueDay: 15,
      brand: ''
    });
  };

  const handleAddTransaction = async (event) => {
    event.preventDefault();
    if (!window.financeApi) {
      setError('API não disponível.');
      return;
    }
    if (!transactionForm.description || !transactionForm.category) {
      setError('Preencha todos os campos obrigatórios da transação.');
      return;
    }
    if (!transactionForm.amount || Number(transactionForm.amount) <= 0) {
      setError('Informe um valor válido.');
      return;
    }
    try {
      const payload = {
        type: transactionForm.type,
        description: transactionForm.description,
        category: transactionForm.category,
        amount: Number(transactionForm.amount),
        transactionDate: transactionForm.date,
        installments:
          transactionForm.type === 'expense' ? Number(transactionForm.installments || 1) : 1,
        cardId:
          transactionForm.type === 'expense' && transactionForm.cardId
            ? Number(transactionForm.cardId)
            : null
      };
      const { transactions: updatedTransactions } = await window.financeApi.addTransaction(
        payload
      );
      setTransactions(updatedTransactions);
      resetTransactionForm();
      setFeedback('Transação adicionada com sucesso.');
      setError('');
    } catch (err) {
      console.error(err);
      setError('Não foi possível adicionar a transação.');
    }
  };

  const handleRemoveTransaction = async (transactionId) => {
    if (!window.financeApi) {
      setError('API não disponível.');
      return;
    }
    try {
      const { transactions: updatedTransactions } = await window.financeApi.removeTransaction(
        transactionId
      );
      setTransactions(updatedTransactions);
      setFeedback('Transação removida.');
    } catch (err) {
      console.error(err);
      setError('Não foi possível remover a transação.');
    }
  };

  const handleAddCard = async (event) => {
    event.preventDefault();
    if (!window.financeApi) {
      setError('API não disponível.');
      return;
    }
    if (!cardForm.name || !cardForm.limitValue) {
      setError('Informe nome e limite do cartão.');
      return;
    }
    try {
      const payload = {
        name: cardForm.name,
        limitValue: Number(cardForm.limitValue),
        closingDay: Number(cardForm.closingDay) || 1,
        dueDay: Number(cardForm.dueDay) || 10,
        brand: cardForm.brand
      };
      const { cards: updatedCards } = await window.financeApi.addCard(payload);
      setCards(updatedCards);
      resetCardForm();
      setFeedback('Cartão registrado com sucesso.');
      setError('');
    } catch (err) {
      console.error(err);
      setError('Não foi possível registrar o cartão.');
    }
  };

  const handleRemoveCard = async (cardId) => {
    if (!window.financeApi) {
      setError('API não disponível.');
      return;
    }
    try {
      const { cards: updatedCards } = await window.financeApi.removeCard(cardId);
      setCards(updatedCards);
      setFeedback('Cartão removido.');
    } catch (err) {
      console.error(err);
      setError('Não foi possível remover o cartão.');
    }
  };

  const categoryChartData = useMemo(() => {
    return {
      labels: categoryTotals.map((item) => item.category),
      datasets: [
        {
          data: categoryTotals.map((item) => Number(item.value.toFixed(2))),
          backgroundColor: categoryTotals.map((item) => item.color),
          borderWidth: 0
        }
      ]
    };
  }, [categoryTotals]);

  const cardBarChartData = useMemo(() => {
    return {
      labels: cardUsage.map((card) => card.name),
      datasets: [
        {
          label: 'Gasto',
          data: cardUsage.map((card) => Number(card.totalSpent.toFixed(2))),
          backgroundColor: '#6366F1',
          borderRadius: 12,
          maxBarThickness: 40
        }
      ]
    };
  }, [cardUsage]);

  const cardBarChartOptions = useMemo(
    () => ({
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      },
      scales: {
        y: {
          ticks: {
            callback: (value) => formatCurrency(value)
          }
        }
      }
    }),
    []
  );

  const renderDashboard = () => (
    <>
      <div className="cards-grid">
        <div className="card">
          <h3>Receitas do mês</h3>
          <div className="value">{formatCurrency(totals.income)}</div>
          <p className="subtext">Receitas cadastradas em {monthOptions[selectedMonth].label}</p>
        </div>
        <div className="card">
          <h3>Despesas do mês</h3>
          <div className="value danger">{formatCurrency(totals.expense)}</div>
          <p className="subtext">Inclui parcelas previstas para este mês</p>
        </div>
        <div className="card">
          <h3>Saldo projetado</h3>
          <div className="value" style={{ color: balance >= 0 ? '#047857' : '#b91c1c' }}>
            {formatCurrency(balance)}
          </div>
          <p className="subtext">
            {balance >= 0 ? 'Você está no positivo!' : 'Atenção: saldo negativo.'}
          </p>
        </div>
        <div className="card">
          <h3>Categoria mais impactante</h3>
          <div className="value">
            {topCategory
              ? `${topCategory.category} (${formatCurrency(topCategory.value)})`
              : 'Sem dados'}
          </div>
          <p className="subtext">
            {topCategory ? 'Reveja seus gastos nesse grupo.' : 'Cadastre suas despesas.'}
          </p>
        </div>
      </div>

      <div className="grid-responsive section">
        <div className="chart-card">
          <div className="chart-title">Gastos por categoria</div>
          {categoryTotals.length ? (
            <Doughnut
              data={categoryChartData}
              options={{
                plugins: {
                  legend: { position: 'bottom' }
                }
              }}
            />
          ) : (
            <div className="empty-state">Cadastre despesas para visualizar o gráfico.</div>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-title">Uso dos cartões</div>
          {cardUsage.length ? (
            <Bar data={cardBarChartData} options={cardBarChartOptions} />
          ) : (
            <div className="empty-state">Cadastre cartões para acompanhar limites.</div>
          )}
        </div>
      </div>
    </>
  );

  const renderTransactions = () => (
    <div className="split-layout section">
      <form className="form-card" onSubmit={handleAddTransaction}>
        <h3>Registrar transação</h3>

        <div className="form-row grid-2">
          <label className="label">
            Tipo
            <select
              value={transactionForm.type}
              onChange={(event) => handleTransactionChange('type', event.target.value)}
            >
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
            </select>
          </label>
          <label className="label">
            Data
            <input
              type="date"
              value={transactionForm.date}
              onChange={(event) => handleTransactionChange('date', event.target.value)}
            />
          </label>
        </div>

        <div className="form-row">
          <label className="label">
            Descrição
            <input
              type="text"
              placeholder="Ex: Salário, Supermercado..."
              value={transactionForm.description}
              onChange={(event) => handleTransactionChange('description', event.target.value)}
              required
            />
          </label>
        </div>

        <div className="form-row grid-2">
          <label className="label">
            Categoria
            <select
              value={transactionForm.category}
              onChange={(event) => handleTransactionChange('category', event.target.value)}
            >
              {categoriesPreset.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Valor
            <NumericFormat
              value={transactionForm.amount || ''}
              thousandSeparator="."
              decimalSeparator=","
              prefix="R$ "
              decimalScale={2}
              fixedDecimalScale
              allowNegative={false}
              onValueChange={({ floatValue }) => handleTransactionChange('amount', floatValue ?? 0)}
              placeholder="R$ 0,00"
            />
          </label>
        </div>

        {transactionForm.type === 'expense' && (
          <div className="form-row grid-2">
            <label className="label">
              Parcelas
              <input
                type="number"
                min="1"
                max="36"
                value={transactionForm.installments}
                onChange={(event) =>
                  handleTransactionChange('installments', Number(event.target.value))
                }
              />
            </label>
            <label className="label">
              Cartão (opcional)
              <select
                value={transactionForm.cardId}
                onChange={(event) => handleTransactionChange('cardId', event.target.value)}
              >
                <option value="">Sem cartão</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <button type="submit">Salvar transação</button>
      </form>

      <div>
        <div className="table-actions">
          <span className="tag">{currentMonthTransactions.length} lançamentos</span>
        </div>
        {currentMonthTransactions.length ? (
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Parcelas</th>
                <th>Cartão</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {currentMonthTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{dayjs(transaction.transaction_date).format('DD/MM/YYYY')}</td>
                  <td>{transaction.description}</td>
                  <td>
                    <span className="chip category-badge">{transaction.category}</span>
                  </td>
                  <td>
                    <span className={`chip ${transaction.type}`}>
                      {transaction.type === 'income' ? 'Receita' : 'Despesa'}
                    </span>
                  </td>
                  <td>{formatCurrency(transaction.amount)}</td>
                  <td>
                    {transaction.installments > 1
                      ? `${transaction.installment_number}/${transaction.installments}`
                      : '-'}
                  </td>
                  <td>
                    {transaction.card_id
                      ? cards.find((card) => card.id === transaction.card_id)?.name || 'Cartão'
                      : '-'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary danger"
                      onClick={() => handleRemoveTransaction(transaction.id)}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            Nenhuma transação neste mês. Cadastre novas receitas ou despesas.
          </div>
        )}
      </div>
    </div>
  );

  const renderCards = () => (
    <div className="split-layout section">
      <form className="form-card" onSubmit={handleAddCard}>
        <h3>Adicionar cartão</h3>
        <div className="form-row">
          <label className="label">
            Nome do cartão
            <input
              type="text"
              placeholder="Ex: Nubank, Itaú..."
              value={cardForm.name}
              onChange={(event) => handleCardChange('name', event.target.value)}
              required
            />
          </label>
        </div>

        <div className="form-row grid-2">
          <label className="label">
            Limite
            <NumericFormat
              value={cardForm.limitValue || ''}
              thousandSeparator="."
              decimalSeparator=","
              prefix="R$ "
              decimalScale={2}
              fixedDecimalScale
              allowNegative={false}
              onValueChange={({ floatValue }) => handleCardChange('limitValue', floatValue ?? 0)}
              placeholder="R$ 0,00"
            />
          </label>

          <label className="label">
            Bandeira (opcional)
            <input
              type="text"
              placeholder="Visa, Mastercard..."
              value={cardForm.brand}
              onChange={(event) => handleCardChange('brand', event.target.value)}
            />
          </label>
        </div>

        <div className="form-row grid-2">
          <label className="label">
            Fechamento
            <input
              type="number"
              min="1"
              max="31"
              value={cardForm.closingDay}
              onChange={(event) => handleCardChange('closingDay', Number(event.target.value))}
            />
          </label>
          <label className="label">
            Vencimento
            <input
              type="number"
              min="1"
              max="31"
              value={cardForm.dueDay}
              onChange={(event) => handleCardChange('dueDay', Number(event.target.value))}
            />
          </label>
        </div>

        <button type="submit">Salvar cartão</button>
      </form>

      <div className="cards-list">
        {cardUsage.length ? (
          cardUsage.map((card) => (
            <div key={card.id} className="credit-card">
              <h4>{card.name}</h4>
              <div className="limit">{formatCurrency(card.limit_value)}</div>
              <div className="metadata">
                <span>Fechamento dia {card.closing_day}</span>
                <span>Vencimento dia {card.due_day}</span>
                <span>{card.brand || 'Bandeira não informada'}</span>
              </div>
              <div className="metadata">
                <span>Gasto: {formatCurrency(card.totalSpent)}</span>
                <span>
                  Livre: {formatCurrency(card.available)}{' '}
                  {card.available < 0 && <strong>Atenção</strong>}
                </span>
              </div>
              <div className="card-actions">
                <button
                  type="button"
                  className="secondary danger"
                  onClick={() => handleRemoveCard(card.id)}
                >
                  Remover
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            Nenhum cartão cadastrado ainda. Adicione para controlar seus limites.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <h1>Personal Finance</h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', marginTop: '6px', fontSize: '0.9rem' }}>
            Controle completo de gastos, cartões e metas.
          </p>
        </div>
        <nav className="nav-list">
          <button
            type="button"
            className={`nav-item ${activeView === VIEWS.DASHBOARD ? 'active' : ''}`}
            onClick={() => setActiveView(VIEWS.DASHBOARD)}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`nav-item ${activeView === VIEWS.TRANSACTIONS ? 'active' : ''}`}
            onClick={() => setActiveView(VIEWS.TRANSACTIONS)}
          >
            Transações
          </button>
          <button
            type="button"
            className={`nav-item ${activeView === VIEWS.CARDS ? 'active' : ''}`}
            onClick={() => setActiveView(VIEWS.CARDS)}
          >
            Cartões
          </button>
        </nav>
      </aside>

      <main className="main-content">
        <div className="content-header">
          <div>
            <h2>
              {activeView === VIEWS.DASHBOARD && 'Visão geral'}
              {activeView === VIEWS.TRANSACTIONS && 'Transações'}
              {activeView === VIEWS.CARDS && 'Cartões'}
            </h2>
            <p style={{ color: '#6b7280', marginTop: '6px' }}>
              {activeView === VIEWS.DASHBOARD &&
                'Acompanhe onde seu dinheiro está sendo investido.'}
              {activeView === VIEWS.TRANSACTIONS &&
                'Registre receitas, despesas e controle parcelamentos.'}
              {activeView === VIEWS.CARDS && 'Gerencie seus cartões e limites disponíveis.'}
            </p>
          </div>
          <div className="filter-row">
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
            >
              {monthOptions.map((month, index) => (
                <option key={month.value} value={index}>
                  {month.label}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && <div className="empty-state">Carregando dados...</div>}
        {!loading && error && <div className="empty-state danger">{error}</div>}
        {!loading && !error && (
          <>
            {activeView === VIEWS.DASHBOARD && renderDashboard()}
            {activeView === VIEWS.TRANSACTIONS && renderTransactions()}
            {activeView === VIEWS.CARDS && renderCards()}
          </>
        )}

        {feedback && (
          <div
            style={{
              position: 'fixed',
              right: '40px',
              bottom: '40px',
              padding: '14px 20px',
              borderRadius: '14px',
              background: '#111827',
              color: '#fff',
              boxShadow: '0 20px 40px rgba(17, 24, 39, 0.2)'
            }}
          >
            {feedback}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
