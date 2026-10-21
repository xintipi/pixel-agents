// Habblaud World fake project names (PLANO.md, sections 4.3 and 6.2): each floor of a building gets an id
// from this list ("ipe", "jade", "aurora"...), drawn by the server from the floor's random id, and the
// visitor's browser translates it ("Projeto Ipê", "Project Ipê", "Proyecto Ipê", "Projet Ipê"). The label changes
// along with the floor id (24 h ± 6 h rotation), so it doesn't identify any project.
//
// Only ASCII ids, neutral and unbranded: 20 trees, 20 stones and 20 constellations (and the aurora). The order is part of the
// draw (index = hash of the floor id): don't reorder or remove items; appending at the end only changes the draw for
// new floors after the next rotation.
//
// Self-contained file (no imports), to be copied as is between the two repositories. The source is the public one
// (shared/world/floor-names.ts, with the labels translated by tr() in shared/world/floor-labels.ts); the world
// server keeps the exact copy (protocol/floor-names.ts, with the hash checked in a test).

export const FLOOR_NAME_IDS = [
  // Trees
  'ipe', 'jacaranda', 'jatoba', 'peroba', 'cedro', 'aroeira', 'araucaria', 'buriti', 'carnauba', 'figueira',
  'oliveira', 'carvalho', 'salgueiro', 'sequoia', 'baoba', 'acacia', 'magnolia', 'cerejeira', 'pinheiro', 'palmeira',
  // Stones
  'jade', 'ambar', 'ametista', 'quartzo', 'topazio', 'turmalina', 'agata', 'onix', 'opala', 'safira',
  'rubi', 'esmeralda', 'granada', 'jaspe', 'malaquita', 'obsidiana', 'turquesa', 'citrino', 'peridoto', 'lapislazuli',
  // Constellations (and the aurora)
  'aurora', 'orion', 'lyra', 'cygnus', 'draco', 'andromeda', 'cassiopeia', 'perseus', 'phoenix', 'hydra',
  'aquila', 'carina', 'vela', 'centaurus', 'crux', 'pavo', 'columba', 'auriga', 'lupus', 'tucana',
] as const;

export type FloorNameId = (typeof FLOOR_NAME_IDS)[number];
