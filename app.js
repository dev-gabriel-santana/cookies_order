const STORAGE_KEY = 'pedidos-cookies';
const STATUS = ['Pendente', 'Em entrega', 'Entregue', 'Cancelado'];
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const PRECO = { nutella: 15, tradicional: 12 };

const calcTotal = (nutella, tradicional, taxa) =>
  nutella * PRECO.nutella + tradicional * PRECO.tradicional + taxa;
const orderTotal = o => calcTotal(o.nutella, o.tradicional, o.taxa);
const fmtNum = n => String(n).padStart(2, '0');
const statusClass = s => 'status-' + s.toLowerCase().replace(/\s+/g, '-');

let state = load();
let editingId = null;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.stock && Array.isArray(saved.orders)) {
      // Migra pedidos salvos antes da numeração existir.
      let next = Math.max(0, ...saved.orders.map(o => o.numero || 0)) + 1;
      for (const o of saved.orders) if (!o.numero) o.numero = next++;
      saved.nextNumber = Math.max(saved.nextNumber || 0, next);
      return saved;
    }
  } catch (e) { /* dados corrompidos: começa do zero */ }
  return { stock: { nutella: 0, tradicional: 0 }, orders: [], nextNumber: 1 };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const $ = id => document.getElementById(id);
const isActive = order => order.status !== 'Cancelado';

function showError(msg) { $('error').textContent = msg || ''; }

function render() {
  const { nutella, tradicional } = state.stock;
  for (const [key, value] of [['nutella', nutella], ['tradicional', tradicional]]) {
    const el = $('stock-' + key);
    el.textContent = value;
    el.classList.toggle('zero', value === 0);
  }
  $('set-nutella').value = nutella;
  $('set-tradicional').value = tradicional;

  const tbody = $('orders');
  tbody.replaceChildren();
  if (!state.orders.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 9;
    td.className = 'empty';
    td.textContent = 'Nenhum pedido lançado.';
    tr.append(td);
    tbody.append(tr);
  }
  for (const order of state.orders) tbody.append(orderRow(order));

  const active = state.orders.filter(isActive);
  $('total-taxas').textContent = brl.format(active.reduce((sum, o) => sum + o.taxa, 0));
  $('total-geral').textContent = brl.format(active.reduce((sum, o) => sum + orderTotal(o), 0));
  refreshMessage();
}

function updatePreview() {
  const nutella = parseInt($('qtd-nutella').value, 10) || 0;
  const tradicional = parseInt($('qtd-tradicional').value, 10) || 0;
  const taxa = parseFloat($('taxa').value) || 0;
  $('preview-total').textContent = brl.format(calcTotal(nutella, tradicional, taxa));
}

for (const id of ['qtd-nutella', 'qtd-tradicional', 'taxa']) $(id).addEventListener('input', updatePreview);

let messageId = null;

function buildMessage(o) {
  const lines = [`Pedido #${fmtNum(o.numero)} - ${o.nome}`, `Endereço: ${o.endereco}`, '', 'Itens:'];
  if (o.nutella) lines.push(`- ${o.nutella}x Cookie Nutella (${brl.format(PRECO.nutella)} cada): ${brl.format(o.nutella * PRECO.nutella)}`);
  if (o.tradicional) lines.push(`- ${o.tradicional}x Cookie Tradicional (${brl.format(PRECO.tradicional)} cada): ${brl.format(o.tradicional * PRECO.tradicional)}`);
  lines.push('', `Taxa de entrega: ${brl.format(o.taxa)}`, `Total: ${brl.format(orderTotal(o))}`);
  return lines.join('\n');
}

function refreshMessage() {
  const order = state.orders.find(o => o.id === messageId);
  $('message-section').hidden = !order;
  if (order) $('message').value = buildMessage(order);
  else messageId = null;
}

function showMessage(id) {
  messageId = id;
  $('copy-feedback').textContent = '';
  refreshMessage();
  $('message-section').scrollIntoView({ behavior: 'smooth' });
}

$('close-message').addEventListener('click', () => { messageId = null; refreshMessage(); });

$('copy-btn').addEventListener('click', async () => {
  const field = $('message');
  try {
    await navigator.clipboard.writeText(field.value);
  } catch (e) {
    // Fallback para contextos sem acesso à API de área de transferência (ex.: file://).
    field.select();
    document.execCommand('copy');
  }
  $('copy-feedback').textContent = 'Copiado!';
});

function cell(text, className) {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function orderRow(order) {
  const tr = document.createElement('tr');
  if (!isActive(order)) tr.className = 'cancelado';
  tr.append(
    cell('#' + fmtNum(order.numero), 'id'),
    cell(order.nome),
    cell(order.endereco),
    cell(order.nutella, 'num'),
    cell(order.tradicional, 'num'),
    cell(brl.format(order.taxa), 'num'),
    cell(brl.format(orderTotal(order)), 'num')
  );

  const select = document.createElement('select');
  select.className = 'status ' + statusClass(order.status);
  for (const s of STATUS) {
    const opt = document.createElement('option');
    opt.value = opt.textContent = s;
    opt.selected = s === order.status;
    select.append(opt);
  }
  select.addEventListener('change', () => changeStatus(order.id, select.value));
  const statusTd = document.createElement('td');
  statusTd.append(select);
  tr.append(statusTd);

  const actions = document.createElement('td');
  actions.className = 'actions';
  const gen = document.createElement('button');
  gen.className = 'small';
  gen.textContent = 'Gerar pedido';
  gen.addEventListener('click', () => showMessage(order.id));
  const edit = document.createElement('button');
  edit.className = 'small';
  edit.textContent = 'Editar';
  edit.addEventListener('click', () => startEdit(order.id));
  const del = document.createElement('button');
  del.className = 'small danger';
  del.textContent = 'Excluir';
  del.addEventListener('click', () => removeOrder(order.id));
  actions.append(gen, edit, del);
  tr.append(actions);
  return tr;
}

$('stock-form').addEventListener('submit', e => {
  e.preventDefault();
  state.stock.nutella = Math.max(0, parseInt($('set-nutella').value, 10) || 0);
  state.stock.tradicional = Math.max(0, parseInt($('set-tradicional').value, 10) || 0);
  save();
  render();
});

$('order-form').addEventListener('submit', e => {
  e.preventDefault();
  showError('');
  const nutella = parseInt($('qtd-nutella').value, 10) || 0;
  const tradicional = parseInt($('qtd-tradicional').value, 10) || 0;
  const taxa = parseFloat($('taxa').value) || 0;
  const nome = $('nome').value.trim();
  const endereco = $('endereco').value.trim();

  if (nutella < 0 || tradicional < 0 || taxa < 0) return showError('Valores não podem ser negativos.');
  if (nutella + tradicional === 0) return showError('Informe ao menos 1 cookie.');
  if (!nome || !endereco) return showError('Informe nome e endereço.');

  const existing = editingId !== null ? state.orders.find(o => o.id === editingId) : null;
  // Cookies do pedido em edição voltam ao saldo antes de validar.
  const refund = existing && isActive(existing) ? existing : { nutella: 0, tradicional: 0 };
  const availNutella = state.stock.nutella + refund.nutella;
  const availTradicional = state.stock.tradicional + refund.tradicional;

  if (nutella > availNutella) return showError(`Estoque insuficiente de Nutella (disponível: ${availNutella}).`);
  if (tradicional > availTradicional) return showError(`Estoque insuficiente de Tradicional (disponível: ${availTradicional}).`);

  const status = existing ? existing.status : 'Pendente';
  if (status !== 'Cancelado') {
    state.stock.nutella = availNutella - nutella;
    state.stock.tradicional = availTradicional - tradicional;
  }

  if (existing) {
    Object.assign(existing, { nome, endereco, nutella, tradicional, taxa });
  } else {
    state.orders.push({ id: Date.now(), numero: state.nextNumber++, nome, endereco, nutella, tradicional, taxa, status });
  }
  save();
  resetForm();
  render();
});

function startEdit(id) {
  const order = state.orders.find(o => o.id === id);
  if (!order) return;
  editingId = id;
  $('nome').value = order.nome;
  $('endereco').value = order.endereco;
  $('qtd-nutella').value = order.nutella;
  $('qtd-tradicional').value = order.tradicional;
  $('taxa').value = order.taxa;
  $('form-title').textContent = 'Editar pedido';
  $('submit-btn').textContent = 'Salvar alterações';
  $('cancel-edit').hidden = false;
  showError('');
  updatePreview();
  $('nome').focus();
  $('order-form').scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  $('order-form').reset();
  $('form-title').textContent = 'Novo pedido';
  $('submit-btn').textContent = 'Lançar pedido';
  $('cancel-edit').hidden = true;
  showError('');
  updatePreview();
}

$('cancel-edit').addEventListener('click', resetForm);

function changeStatus(id, newStatus) {
  const order = state.orders.find(o => o.id === id);
  if (!order || order.status === newStatus) return;
  showError('');

  const wasActive = isActive(order);
  const willBeActive = newStatus !== 'Cancelado';

  if (!wasActive && willBeActive) {
    if (order.nutella > state.stock.nutella || order.tradicional > state.stock.tradicional) {
      showError('Estoque insuficiente para reativar este pedido.');
      return render();
    }
    state.stock.nutella -= order.nutella;
    state.stock.tradicional -= order.tradicional;
  } else if (wasActive && !willBeActive) {
    state.stock.nutella += order.nutella;
    state.stock.tradicional += order.tradicional;
  }

  order.status = newStatus;
  save();
  render();
}

function removeOrder(id) {
  const order = state.orders.find(o => o.id === id);
  if (!order || !confirm(`Excluir o pedido #${fmtNum(order.numero)} de ${order.nome}?`)) return;
  if (isActive(order)) {
    state.stock.nutella += order.nutella;
    state.stock.tradicional += order.tradicional;
  }
  state.orders = state.orders.filter(o => o.id !== id);
  if (editingId === id) resetForm();
  save();
  render();
}

render();
