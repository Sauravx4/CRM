/**
 * LEAD VERIFICATION CRM - CUSTOMER FEEDBACK COMPONENT
 * Production-Ready React Component
 * 
 * Usage:
 * import CustomerFeedback from './CustomerFeedback';
 * 
 * In your router:
 * <Route path="/review" element={<CustomerFeedback token={urlToken} />} />
 * 
 * Features:
 * - Secure token-based access
 * - Responsive Tailwind CSS design
 * - Error handling and state management
 * - Loading and success states
 * - Form validation
 * - Automatic submission to backend
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const CustomerFeedback = ({ token }) => {
  // State Management
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [notes, setNotes] = useState('');
  const [decision, setDecision] = useState(null);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

  // Fetch lead data on component mount
  useEffect(() => {
    fetchLead();
  }, [token]);

  /**
   * Fetch lead details from backend using token
   */
  const fetchLead = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`${BACKEND_URL}/api/feedback/${token}`, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      setLead(response.data);
    } catch (err) {
      if (err.response?.status === 410) {
        setError({
          icon: '⏰',
          title: 'Review Link Expired',
          message: 'This review link has expired. Please contact support to request a new one.'
        });
      } else if (err.response?.status === 404) {
        setError({
          icon: '❌',
          title: 'Invalid Link',
          message: 'Lead not found. Please check your review link.'
        });
      } else if (err.response?.status === 400 && err.response?.data?.status) {
        setError({
          icon: '✅',
          title: 'Already Submitted',
          message: `You have already submitted your response: ${err.response.data.status}`
        });
        setSubmitted(true);
      } else if (err.code === 'ECONNABORTED') {
        setError({
          icon: '⚠️',
          title: 'Connection Timeout',
          message: 'The server is taking too long to respond. Please refresh and try again.'
        });
      } else {
        setError({
          icon: '❌',
          title: 'Error Loading Review',
          message: err.response?.data?.error || 'Failed to load your review. Please try again.'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle feedback submission
   */
  const handleSubmit = async (selectedDecision) => {
    try {
      setSubmitting(true);
      setError(null);

      // Validate token exists
      if (!token) {
        setError({
          icon: '⚠️',
          title: 'Invalid Token',
          message: 'No valid token provided. Please use the link from your email.'
        });
        return;
      }

      // Send feedback to backend
      const response = await axios.post(
        `${BACKEND_URL}/api/feedback/${token}`,
        {
          decision: selectedDecision,
          notes: notes || undefined
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      setDecision(selectedDecision);
      setSubmitted(true);
      setError(null);

      // Optional: Send analytics event
      if (window.gtag) {
        window.gtag('event', 'lead_feedback_submitted', {
          decision: selectedDecision,
          has_notes: !!notes
        });
      }

    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        setError({
          icon: '⚠️',
          title: 'Timeout',
          message: 'Request took too long. Please try again.'
        });
      } else if (err.response?.status === 410) {
        setError({
          icon: '⏰',
          title: 'Link Expired',
          message: 'Your review link has expired. Please contact support.'
        });
      } else if (err.response?.status === 400) {
        setError({
          icon: '❌',
          title: 'Submission Failed',
          message: err.response.data.error || 'Failed to submit feedback. Please try again.'
        });
      } else {
        setError({
          icon: '❌',
          title: 'Server Error',
          message: 'Unable to submit your response. Please check your connection and try again.'
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // =========================================================================
  // LOADING STATE
  // =========================================================================
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-indigo-600 mx-auto mb-6"></div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Loading your review</h2>
          <p className="text-gray-600">Please wait while we prepare your project details...</p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUCCESS/SUBMITTED STATE
  // =========================================================================
  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full text-center transform transition-all">
          <div className="text-6xl mb-4 animate-bounce">
            {decision === 'INTERESTED' ? '✅' : '❌'}
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {decision === 'INTERESTED' ? 'Thank You!' : 'Feedback Received'}
          </h2>

          <p className="text-gray-600 mb-6 leading-relaxed">
            {decision === 'INTERESTED'
              ? "We're excited about the opportunity to work together! Our team will get in touch with you soon."
              : 'We appreciate your feedback and will reach out if there are any future opportunities that match your needs.'}
          </p>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">
              <span className="font-semibold">Response submitted at:</span>
              <br />
              {new Date().toLocaleString()}
            </p>
          </div>

          <div className="text-sm text-gray-500 space-y-2">
            <p>✓ Your response has been recorded</p>
            <p>✓ Our team has been notified</p>
            <p>✓ You can close this window</p>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              <strong>Company:</strong> {process.env.REACT_APP_COMPANY_NAME || 'Your Company Name'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ERROR STATE
  // =========================================================================
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">{error.icon}</div>

          <h2 className="text-2xl font-bold text-gray-800 mb-2">{error.title}</h2>

          <p className="text-gray-600 mb-6 leading-relaxed">{error.message}</p>

          {!submitted && (
            <button
              onClick={fetchLead}
              disabled={loading}
              className="w-full py-2 px-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Retrying...' : 'Try Again'}
            </button>
          )}

          <p className="text-xs text-gray-500 mt-6">
            If you continue to experience issues, please contact{' '}
            <a
              href="mailto:support@company.com"
              className="text-indigo-600 hover:underline"
            >
              support
            </a>
          </p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN FEEDBACK FORM
  // =========================================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header Section */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4">
            <div className="bg-indigo-100 rounded-full p-3">
              <span className="text-3xl">📋</span>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-3">Project Review</h1>
          <p className="text-gray-600 text-lg">
            Please review your project requirements and let us know your interest
          </p>
        </div>

        {/* Main Content Card */}
        <div className="space-y-6">
          {/* Contact Information Card */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
            <div className="bg-gradient-to-r from-indigo-500 to-blue-500 px-6 py-4">
              <h3 className="text-lg font-bold text-white">👤 Your Information</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Name
                  </label>
                  <p className="text-gray-900 font-semibold text-lg">{lead.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Email
                  </label>
                  <p className="text-gray-900 font-mono text-sm break-all">{lead.email}</p>
                </div>
              </div>

              {lead.phone && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Phone
                  </label>
                  <p className="text-gray-900 font-semibold">{lead.phone}</p>
                </div>
              )}
            </div>
          </div>

          {/* Project Requirements Card */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-4">
              <h3 className="text-lg font-bold text-white">🎯 Project Requirements</h3>
            </div>
            <div className="p-6 space-y-4">
              {/* Requirements Summary */}
              <div>
                <label className="block text-sm font-medium text-gray-700 uppercase tracking-wide mb-3">
                  Summary
                </label>
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border-l-4 border-indigo-500 rounded-lg p-4">
                  <p className="text-gray-800 leading-relaxed text-base">
                    {lead.requirementsSummary || '(No specific requirements provided)'}
                  </p>
                </div>
              </div>

              {/* Budget Range */}
              {lead.budgetRange && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 uppercase tracking-wide mb-1">
                    Budget Range
                  </label>
                  <div className="inline-block bg-green-100 text-green-800 px-4 py-2 rounded-full font-semibold">
                    💰 {lead.budgetRange}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Customer Feedback Card */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
            <div className="bg-gradient-to-r from-cyan-500 to-indigo-500 px-6 py-4">
              <h3 className="text-lg font-bold text-white">💬 Your Feedback</h3>
            </div>
            <div className="p-6 space-y-6">
              {/* Notes Textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Comments <span className="text-gray-500">(Optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Share any additional thoughts, questions, or concerns about this project..."
                  maxLength={1000}
                  disabled={submitting}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none disabled:bg-gray-50 disabled:text-gray-500 transition-all"
                  rows="4"
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-500">
                    Maximum 1000 characters
                  </p>
                  <p className={`text-xs font-medium ${notes.length > 900 ? 'text-red-600' : 'text-gray-500'}`}>
                    {notes.length}/1000
                  </p>
                </div>
              </div>

              {/* Decision Buttons */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-700">How would you like to proceed?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Not Interested Button */}
                  <button
                    onClick={() => handleSubmit('NOT_INTERESTED')}
                    disabled={submitting}
                    className="group relative py-4 px-4 bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-300 text-red-700 font-bold rounded-lg hover:from-red-100 hover:to-red-200 hover:border-red-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                  >
                    <span className="text-2xl mb-1 block">❌</span>
                    <span>Not Interested</span>
                    <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-20 bg-red-400"></div>
                  </button>

                  {/* Interested Button */}
                  <button
                    onClick={() => handleSubmit('INTERESTED')}
                    disabled={submitting}
                    className="group relative py-4 px-4 bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 text-green-700 font-bold rounded-lg hover:from-green-100 hover:to-green-200 hover:border-green-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
                  >
                    <span className="text-2xl mb-1 block">✅</span>
                    <span>I'm Interested</span>
                    <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-20 bg-green-400"></div>
                  </button>
                </div>
              </div>

              {/* Submitting Indicator */}
              {submitting && (
                <div className="flex items-center justify-center space-x-3 bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
                  <p className="text-blue-700 font-medium">Submitting your response...</p>
                </div>
              )}
            </div>
          </div>

          {/* Information Banner */}
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-l-4 border-indigo-500 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">ℹ️ Note:</span> This review link is valid for 30 days from creation. 
              After submission, you cannot change your response.
            </p>
          </div>

          {/* Footer */}
          <div className="text-center pt-4">
            <p className="text-xs text-gray-500">
              © {new Date().getFullYear()} {process.env.REACT_APP_COMPANY_NAME || 'Company Name'}. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerFeedback;
