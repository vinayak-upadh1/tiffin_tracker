// Re-export from AuthContext so existing call-sites (LoginPage, Layout, App)
// don't need to change their import paths.
export { useAuthContext as useAuth } from "../contexts/AuthContext";
