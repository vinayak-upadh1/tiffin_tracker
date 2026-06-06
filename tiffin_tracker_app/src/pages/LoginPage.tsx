import { useNavigate } from "react-router-dom";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useState } from "react";
import { authApi } from "../api/auth";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) return;
    setLoading(true);
    setError(null);
    try {
      const { access_token } = await authApi.googleAuth(response.credential);
      login(access_token);
      navigate("/");
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">T</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Tiffin Tracker</h1>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed">
            Manage subscribers, track deliveries,<br />and collect payments — all in one place.
          </p>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-2">
              <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleSuccess}
                onError={() => setError("Sign-in failed. Please try again.")}
                shape="rectangular"
                theme="outline"
                size="large"
                text="signin_with"
              />
            </div>
          )}

          {error && (
            <p className="text-red-500 text-sm text-center bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center mt-6">
          For tiffin operators only. Your data is private and secure.
        </p>
      </div>
    </div>
  );
}
