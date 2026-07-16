require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

// [ordem, nome, categoria, unidade, min_stock]
const products = [
  [1,  'Muçarela Frizzo Planato',                'Laticínios',   'Peças',              4],
  [2,  'Muçarela de Bufala',                     'Laticínios',   'Baldes',             1],
  [3,  'Provolone Tania',                        'Laticínios',   'Peças',              1],
  [4,  'Parmesão Scala',                         'Laticínios',   'Peças',              1],
  [5,  'Gorgonzola Quata',                       'Laticínios',   'Peças',              1],
  [6,  'Catupiry',                               'Laticínios',   'Bisnagas',           3],
  [7,  'Cheddar Scala',                          'Laticínios',   'Bisnagas',           2],
  [8,  'Pistache Vabene',                        'Laticínios',   'Bisnagas',           1],
  [9,  'Cream Cheese Philadelphia',              'Laticínios',   'Bisnagas',           1],
  [10, 'Atum Marsul',                            'Outros',       'Latas',              1],
  [11, 'Milho Quero',                            'Outros',       'Latas',              1],
  [12, 'Ervilha Quero',                          'Outros',       'Latas',              1],
  [13, 'Azeitona Verde sem Caroço',              'Outros',       'Baldes',             5],
  [14, 'Champignon',                             'Outros',       'Baldes',             1],
  [15, 'Chocolate ao Leite Harald',              'Outros',       'Bisnagas',           1],
  [16, 'Chocolate Branco Harald',                'Outros',       'Bisnagas',           1],
  [17, "M&M's 1KG",                             'Outros',       'Pacotes',            1],
  [18, 'Nutella 3KG',                            'Outros',       'Baldes',             2],
  [19, 'Doce de Leite Frimesa',                  'Outros',       'Baldes',             1],
  [20, 'Manteiga 5KG',                           'Laticínios',   'Caixas',             1],
  [21, 'Orégano',                                'Outros',       'Pacotes',            1],
  [22, 'Pepperoni Ceratti',                      'Embutidos',    'Pacotes',            2],
  [23, 'Pimenta Biquinho',                       'Molhos',       'Potes',              1],
  [24, 'Carne Seca Alfama',                      'Embutidos',    'Pacotes',            3],
  [25, 'Fermento biológico em pó Fleischmann',   'Massas',       'Pacotes',            1],
  [26, 'Açúcar',                                 'Outros',       'Pacotes',            1],
  [27, 'Açúcar Demerara',                        'Outros',       'Pacotes',            1],
  [28, 'Sal',                                    'Outros',       'Pacotes',            1],
  [29, 'Fubá',                                   'Massas',       'Pacotes',            1],
  [30, 'Farinha de Trigo Anaconda',              'Massas',       'Fardos',             5],
  [31, 'Azeite 5 Litros',                        'Molhos',       'Galões',             1],
  [32, 'Escarola',                               'Outros',       'Pacotes',            1],
  [33, 'Brócolis Picado',                        'Outros',       'Pacotes',            1],
  [34, 'Peito de Peru Sadia',                    'Embutidos',    'Peças',              1],
  [35, 'Bacon Sadia',                            'Embutidos',    'Caixas',             7],
  [36, 'Apresuntado Aurora',                     'Embutidos',    'Peças',              4],
  [37, 'Calabresa Reta Nobre',                   'Embutidos',    'Peças',              2],
  [38, 'Lombo Canadense Nobre',                  'Embutidos',    'Peças',              1],
  [39, 'Leite Condensado 395G',                  'Laticínios',   'Unidades',           1],
  [40, 'Doritos',                                'Outros',       'Pacotes',            1],
  [41, 'Moeda de Chocolate ao Leite Genuine',    'Outros',       'Pacotes',            1],
  [42, 'Moeda de Chocolate Branco Genuine',      'Outros',       'Pacotes',            1],
  [43, 'Batata Palha Yoki',                      'Outros',       'Pacotes',            1],
  [44, 'Catchup Cepera',                         'Molhos',       'Baldes',             1],
  [45, 'Mostarda Cepera',                        'Molhos',       'Baldes',             1],
  [46, 'Creme de Leite',                         'Laticínios',   'Pacotes',            1],
  [47, 'Tomate Seco Porto Belo',                 'Molhos',       'Baldes',             1],
  [48, 'Filezinho de Sassami',                   'Embutidos',    'Pacotes',            2],
  [49, 'Filé Mignon',                            'Embutidos',    'Unidades',           1],
  [50, 'Costela',                                'Embutidos',    'Unidades',           1],
  [51, 'Palmito Atração',                        'Outros',       'Vidros',             1],
  [52, 'Alho Frito',                             'Molhos',       'Pacotes',            1],
  [53, 'Shimeji',                                'Outros',       'Pacotes',            1],
  [54, 'Shitake',                                'Outros',       'Pacotes',            1],
  [55, 'Papel Interfolhas',                      'Limpeza',      'Pacotes',            1],
  [56, 'Papel Higiênico',                        'Limpeza',      'Pacotes',            1],
  [57, 'Esponja',                                'Limpeza',      'Unidades',           2],
  [58, 'Saco de Lixo 60 Litros',                 'Limpeza',      'Pacotes',            1],
  [59, 'Desengraxante',                          'Limpeza',      'Galões',             1],
  [60, 'Detergente',                             'Limpeza',      'Galões',             1],
  [61, 'Detergente + Cloro',                     'Limpeza',      'Galões',             1],
  [62, 'P35 - Grande',                           'Descartáveis', 'Fardos',             500],
  [63, 'P25 - Pequena',                          'Descartáveis', 'Fardos',             107],
  [64, 'P35 - Grande Gulosos',                   'Descartáveis', 'Fardos',             1],
  [65, 'P25 - Pequena Gulosos',                  'Descartáveis', 'Fardos',             1],
  [66, 'Sacolas',                                'Descartáveis', 'Unidades',           1],
  [67, 'Lacre',                                  'Descartáveis', 'Unidades',           1],
  [68, 'Sacos fracionamento 20 x 30',            'Descartáveis', 'Fardos',             6],
  [69, 'Saco Vácuo 20 x 15',                     'Descartáveis', 'Unidades',           1],
  [70, 'Saco Vácuo 20 x 25',                     'Descartáveis', 'Unidades',           1],
  [71, 'Saco Catupiry',                          'Descartáveis', 'Unidades',           1],
  [72, 'Toucas',                                 'Descartáveis', 'Unidades',           1],
  [73, 'Bobinas Impressora',                     'Descartáveis', 'Unidades',           1],
  [74, 'Bic',                                    'Escritório',   'Unidades',           1],
  [75, 'Grifa Texto Verde Limão',                'Escritório',   'Unidades',           1],
  [76, 'Grifa Texto Verde',                      'Escritório',   'Unidades',           1],
  [77, 'Grifa Texto Rosa',                       'Escritório',   'Unidades',           1],
  [78, 'Grifa Texto Laranja',                    'Escritório',   'Unidades',           1],
  [79, 'Clipes',                                 'Escritório',   'Unidades',           1],
  [80, 'Grampos',                                'Escritório',   'Unidades',           1],
  [81, 'Durex',                                  'Escritório',   'Unidades',           1],
  [82, 'Cupom Ifood',                            'Outros',       'Unidades',           1],
  [83, 'Bombom Sonho de Valsa Ifood',            'Outros',       'Unidades',           1],
  [84, 'Coca Cola 350 Ml',                       'Bebidas',      'Latas',              1],
  [85, 'Coca Cola Zero 350 Ml',                  'Bebidas',      'Latas',              1],
  [86, 'Coca Cola 2 Litros',                     'Bebidas',      'Fardos',             7],
  [87, 'Coca Cola 2 Litros Zero',                'Bebidas',      'Fardos',             5],
  [88, 'Água sem gás',                           'Bebidas',      'Garrafas',           1],
  [89, 'Guaraná Antartica 1 Litro',              'Bebidas',      'Fardos',             4],
  [90, 'Pepsi 1 Litro',                          'Bebidas',      'Fardos',             2],
  [91, 'Guaraná 350 Ml',                         'Bebidas',      'Latas',              1],
  [92, 'Brahma 350 Ml',                          'Bebidas',      'Latas',              1],
  [93, 'Heineken Long Neck',                     'Bebidas',      'Garrafas',           1],
];

async function seed() {
  // Usuários
  const users = [
    ['Dono', 'dono@buonna.com', 'buonna2024', 'dono', null],
    ['Gerente SP', 'gerente@buonna.com', 'gerente123', 'gerente', 1],
    ['Contador', 'contador@buonna.com', 'contador123', 'contador', 1],
  ];
  for (const [name, email, password, role, unit_id] of users) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role, unit_id)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (email) DO UPDATE SET
         name=$1, password_hash=$3, role=$4, unit_id=$5`,
      [name, email, hash, role, unit_id]
    );
  }
  const propHash = await bcrypt.hash('buonna2024', 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
    ['Proprietário', 'proprietario@buonna.com', propHash, 'proprietario']
  );

  // Apaga tudo para garantir lista limpa
  await pool.query(`DELETE FROM stock_count_items`);
  await pool.query(`DELETE FROM quotation_prices`);
  await pool.query(`DELETE FROM supplier_product_prices`);
  await pool.query(`DELETE FROM products`);

  // Insere produtos na ordem exata da planilha
  for (const [ordem, name, category, unit, min_stock] of products) {
    await pool.query(
      `INSERT INTO products (name, category, unit_measure, purchase_unit, min_stock, ordem)
       VALUES ($1, $2, $3, $3, $4, $5)`,
      [name, category, unit, min_stock, ordem]
    );
  }

  console.log('Seed concluído.');
  console.log(`Produtos inseridos: ${products.length}`);

  // Verificação final
  const result = await pool.query(`SELECT name, unit_measure, ordem FROM products ORDER BY ordem ASC`);
  console.log('\n--- ORDEM FINAL NO BANCO ---');
  result.rows.forEach(r => console.log(`${String(r.ordem).padStart(2, ' ')}. ${r.name} (${r.unit_measure})`));

  await pool.end();
}

seed().catch(err => { console.error('Erro:', err.message); process.exit(1); });
