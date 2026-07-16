require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

// [ordem, nome, categoria, unidade, min_stock]
const products = [
  [1,  'Muçarela Frizzo Planato',                   'Laticínios',   'Peças',    4],
  [2,  'Provolone Tania ou Scala',                  'Laticínios',   'Peças',    1],
  [3,  'Parmesão Scala',                            'Laticínios',   'Peças',    1],
  [4,  'Gorgonzola Quata',                          'Laticínios',   'Peças',    1],
  [5,  'Catupiry',                                  'Laticínios',   'Bisnagas', 3],
  [6,  'Cheddar Scala',                             'Laticínios',   'Bisnagas', 2],
  [7,  'Cream Cheese Philadelphia',                 'Laticínios',   'Bisnagas', 1],
  [8,  'Atum Marsul',                               'Outros',       'Latas',    1],
  [9,  'Milho Quero',                               'Outros',       'Latas',    1],
  [10, 'Ervilha Quero',                             'Outros',       'Latas',    1],
  [11, 'Azeitona Portobello',                       'Outros',       'Baldes',   5],
  [12, 'Champignon Portobello',                     'Outros',       'Baldes',   1],
  [13, 'Chocolate ao Leite Harold',                 'Outros',       'Bisnagas', 1],
  [14, "M&M's",                                     'Outros',       'Pacotes',  1],
  [15, 'Nutella',                                   'Outros',       'Baldes',   2],
  [16, 'Doce de Leite Frimesa',                     'Outros',       'Baldes',   1],
  [17, 'Goiabada Raston',                           'Outros',       'Bisnagas', 1],
  [18, 'Manteiga',                                  'Laticínios',   'Caixas',   1],
  [19, 'Orégano',                                   'Outros',       'Pacotes',  1],
  [20, 'Pepperoni Ceratti',                         'Embutidos',    'Pacotes',  2],
  [21, 'Pimenta Biquinho',                          'Molhos',       'Potes',    1],
  [22, 'Camarão',                                   'Embutidos',    'Pacotes',  1],
  [23, 'Carne Seca Alfama',                         'Embutidos',    'Pacotes',  3],
  [24, 'Fermento Biológico em Pó Fleischmann',      'Massas',       'Pacotes',  1],
  [25, 'Açúcar',                                    'Outros',       'Pacotes',  1],
  [26, 'Açúcar Demerara',                           'Outros',       'Pacotes',  1],
  [27, 'Sal',                                       'Outros',       'Pacotes',  1],
  [28, 'Fubá',                                      'Massas',       'Pacotes',  1],
  [29, 'Farinha de Trigo Anaconda',                 'Massas',       'Fardos',   5],
  [30, 'Azeite 5 Litros',                           'Molhos',       'Galões',   1],
  [31, 'Escarola',                                  'Outros',       'Pacotes',  1],
  [32, 'Brócolis Sadia',                            'Outros',       'Pacotes',  1],
  [33, 'Peito de Peru Sadia',                       'Embutidos',    'Peças',    1],
  [34, 'Bacon Sadia',                               'Embutidos',    'Caixas',   7],
  [35, 'Apresuntado Aurora',                        'Embutidos',    'Peças',    4],
  [36, 'Calabresa Reta Nobre',                      'Embutidos',    'Peças',    2],
  [37, 'Lombo Canadense Nobre',                     'Embutidos',    'Peças',    1],
  [38, 'Leite Condensado',                          'Laticínios',   'Unidades', 1],
  [39, 'Doritos',                                   'Outros',       'Pacotes',  1],
  [40, 'Mistura Para Massa sem Glúten Vitalin',     'Massas',       'Pacotes',  1],
  [41, 'Farinha de Trigo Integral',                 'Massas',       'Pacotes',  1],
  [42, 'Farinha de Coco',                           'Massas',       'Pacotes',  1],
  [43, 'Barra de Chocolate 1KG para Mousse',        'Outros',       'Pacotes',  1],
  [44, 'Barra de Chocolate Branco 1KG para Ganache','Outros',       'Pacotes',  1],
  [45, 'Creme de Leite',                            'Laticínios',   'Pacotes',  1],
  [46, 'Tomate Seco',                               'Molhos',       'Baldes',   1],
  [47, 'Sassami C Vale',                            'Embutidos',    'Pacotes',  2],
  [48, 'Palmito Atração',                           'Outros',       'Vidros',   1],
  [49, 'Azeitona Preta Fatiada sem Caroço',         'Outros',       'Baldes',   1],
  [50, 'Batata para Fritar',                        'Outros',       'Pacotes',  1],
  [51, 'Alho Frito',                                'Molhos',       'Pacotes',  1],
  [52, 'Tilápia',                                   'Embutidos',    'Pacotes',  1],
  [53, 'Shimeji',                                   'Outros',       'Pacotes',  1],
  [54, 'Shitake',                                   'Outros',       'Pacotes',  1],
  [55, 'Álcool Gel',                                'Limpeza',      'Potes',    1],
  [56, 'Papel Interfolhas',                         'Limpeza',      'Pacotes',  1],
  [57, 'Papel Higiênico',                           'Limpeza',      'Pacotes',  1],
  [58, 'Esponja',                                   'Limpeza',      'Unidades', 2],
  [59, 'Saco de Lixo',                              'Limpeza',      'Pacotes',  1],
  [60, 'P35 - Grande',                              'Descartáveis', 'Fardos',   500],
  [61, 'P25 - Pequena',                             'Descartáveis', 'Fardos',   107],
  [62, 'Lacre',                                     'Descartáveis', 'Unidades', 1],
  [63, 'Sacos Fracionamento',                       'Descartáveis', 'Fardos',   6],
  [64, 'Bobinas Impressora',                        'Descartáveis', 'Unidades', 1],
  [65, 'Coca Cola Lata',                            'Bebidas',      'Latas',    1],
  [66, 'Coca Cola Lata Zero',                       'Bebidas',      'Latas',    1],
  [67, 'Coca Cola 2 Litros',                        'Bebidas',      'Fardos',   7],
  [68, 'Coca Cola 2 Litros Zero',                   'Bebidas',      'Fardos',   5],
  [69, 'Água sem Gás',                              'Bebidas',      'Fardos',   1],
  [70, 'Guaraná Antártica 1 Litro',                 'Bebidas',      'Fardos',   4],
  [71, 'Pepsi 1 Litro',                             'Bebidas',      'Fardos',   2],
  [72, 'Guaraná Lata',                              'Bebidas',      'Latas',    1],
  [73, 'Brahma Lata',                               'Bebidas',      'Latas',    1],
  [74, 'Heineken Long Neck',                        'Bebidas',      'Garrafas', 1],
  [75, 'Abacaxi',                                   'Outros',       'Unidades', 1],
  [76, 'Abacaxi com Hortelã',                       'Outros',       'Unidades', 1],
  [77, 'Maracujá',                                  'Outros',       'Unidades', 1],
  [78, 'Morango',                                   'Outros',       'Unidades', 1],
  [79, 'Pêssego',                                   'Outros',       'Unidades', 1],
  [80, 'Acerola',                                   'Outros',       'Unidades', 1],
  [81, 'Embalagem Suco',                            'Outros',       'Unidades', 1],
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

  // Apaga todos os produtos para garantir ordem limpa
  await pool.query(`DELETE FROM stock_count_items`);
  await pool.query(`DELETE FROM quotation_prices`);
  await pool.query(`DELETE FROM supplier_product_prices`);
  await pool.query(`DELETE FROM products`);

  // Insere produtos na ordem correta
  for (const [ordem, name, category, unit, min_stock] of products) {
    await pool.query(
      `INSERT INTO products (name, category, unit_measure, purchase_unit, min_stock, ordem)
       VALUES ($1, $2, $3, $3, $4, $5)`,
      [name, category, unit, min_stock, ordem]
    );
  }

  // Desativa qualquer produto fora da lista (não deve haver, mas por segurança)
  const names = products.map(p => p[1]);
  await pool.query(`UPDATE products SET active = FALSE WHERE name != ALL($1::text[])`, [names]);

  console.log('Seed concluído.');
  console.log(`Produtos: ${products.length}`);

  // Verificação final
  const result = await pool.query(`SELECT name, ordem FROM products ORDER BY ordem ASC`);
  console.log('\n--- ORDEM FINAL NO BANCO ---');
  result.rows.forEach(r => console.log(`${String(r.ordem).padStart(2, ' ')}. ${r.name}`));

  await pool.end();
}

seed().catch(err => { console.error('Erro:', err.message); process.exit(1); });
