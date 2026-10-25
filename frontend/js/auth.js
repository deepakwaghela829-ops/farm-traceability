// auth.js - Session & Authentication Management for AgriTrace OS
import { loginApi, fetchCurrentUserApi } from './api.js';

const TOKEN_KEY = 'agritrace_token';

let currentUser = null;

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  currentUser = null;
}

export function getCurrentUser() {
  return currentUser;
}

export function setCurrentUser(user) {
  currentUser = user;
}

export async function login(username, password) {
  const data = await loginApi(username, password);
  setToken(data.access_token);
  currentUser = data.user;
  return data;
}

export function logout() {
  clearToken();
  window.location.hash = '#/login';
}

export async function checkSession() {
  const token = getToken();
  if (!token) return null;

  try {
    currentUser = await fetchCurrentUserApi(token);
    return currentUser;
  } catch (err) {
    console.warn('Session expired or invalid token:', err);
    clearToken();
    return null;
  }
}
