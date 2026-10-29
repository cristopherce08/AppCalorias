/**
 * foodsRepo.js — Repositorio de persistencia para la biblioteca de alimentos e ingredientes
 */
import { getAll, mutate } from './db.js';

export async function getFoods() {
  return getAll('foods');
}

export async function saveFood(food) {
  return mutate('foods', 'put', food);
}

export async function deleteFood(id) {
  return mutate('foods', 'delete', id);
}
