// notifications.js - Unified In-App Toast & Accessible Modal Dialog System
import { icons } from './icons.js';

let activeDialogResolve = null;
let previousFocusedElement = null;

// Ensure Toast Container exists in DOM
function getToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-label', 'System notifications');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Display a polished, accessible in-app toast notification.
 * @param {string} message - Notification text
 * @param {'success'|'error'|'warning'|'info'} [type='info'] - Variant
 * @param {string|null} [title=null] - Optional heading
 * @param {object} [options={}] - { duration, persistent, action: { label, onClick } }
 */
export function showToast(message, type = 'info', title = null, options = {}) {
  const container = getToastContainer();
  if (!container) return null;

  const validTypes = ['success', 'error', 'warning', 'info'];
  const variant = validTypes.includes(type) ? type : 'info';

  const defaultTitles = {
    success: 'Success',
    error: 'Action Failed',
    warning: 'Attention Required',
    info: 'System Update',
  };

  const defaultDurations = {
    success: 4500,
    info: 4500,
    warning: 6000,
    error: 8000,
  };

  const finalTitle = title !== null ? title : defaultTitles[variant];
  const isPersistent = Boolean(options.persistent || (variant === 'error' && options.persistent !== false && options.duration === 0));
  const duration = options.duration !== undefined ? options.duration : defaultDurations[variant];

  // Set aria-live appropriately
  container.setAttribute('aria-live', variant === 'error' ? 'assertive' : 'polite');

  const toast = document.createElement('div');
  toast.className = `toast toast-${variant}`;
  toast.setAttribute('role', 'status');

  const iconSvg =
    variant === 'success'
      ? icons.check
      : variant === 'error'
      ? icons.alertCircle
      : variant === 'warning'
      ? icons.alertTriangle
      : icons.info;

  let actionHtml = '';
  if (options.action && options.action.label) {
    actionHtml = `<button class="toast-action-btn" type="button">${options.action.label}</button>`;
  }

  toast.innerHTML = `
    <div class="toast-icon-wrap" aria-hidden="true">${iconSvg}</div>
    <div class="toast-content-wrap">
      ${finalTitle ? `<div class="toast-title">${finalTitle}</div>` : ''}
      <div class="toast-message">${message}</div>
      ${actionHtml}
    </div>
    <button class="toast-close" type="button" aria-label="Dismiss notification">&times;</button>
  `;

  if (options.action && options.action.onClick) {
    const actionBtn = toast.querySelector('.toast-action-btn');
    if (actionBtn) {
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        options.action.onClick();
        dismiss();
      });
    }
  }

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    dismiss();
  });

  let dismissTimeout = null;
  let remainingTime = duration;
  let startTime = Date.now();

  function dismiss() {
    if (dismissTimeout) clearTimeout(dismissTimeout);
    if (!toast.parentElement) return;

    toast.classList.add('toast-dismissing');
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    setTimeout(() => {
      toast.remove();
    }, 250);
  }

  if (!isPersistent && duration > 0) {
    const startTimer = (ms) => {
      startTime = Date.now();
      dismissTimeout = setTimeout(dismiss, ms);
    };

    startTimer(remainingTime);

    // Pause dismissal on hover so user can read message
    toast.addEventListener('mouseenter', () => {
      if (dismissTimeout) {
        clearTimeout(dismissTimeout);
        remainingTime -= Date.now() - startTime;
      }
    });

    toast.addEventListener('mouseleave', () => {
      if (remainingTime > 500) {
        startTimer(remainingTime);
      } else {
        startTimer(1000);
      }
    });
  }

  container.appendChild(toast);
  return { dismiss };
}

// Global convenience object
export const toast = {
  success: (msg, title = 'Success', opts = {}) => showToast(msg, 'success', title, opts),
  error: (msg, title = 'Action Failed', opts = {}) => showToast(msg, 'error', title, opts),
  warning: (msg, title = 'Attention Required', opts = {}) => showToast(msg, 'warning', title, opts),
  info: (msg, title = 'System Information', opts = {}) => showToast(msg, 'info', title, opts),
};

window.showToast = showToast;
window.toast = toast;

/**
 * Display a polished, accessible custom confirmation dialog.
 * Replaces window.confirm() and native alert() across the application.
 * Returns a Promise that resolves to true (confirmed) or false (cancelled).
 *
 * @param {object} options
 * @param {string} options.title - Dialog heading
 * @param {string} options.message - Main explanation
 * @param {Array<{label: string, value: string|number}>|string} [options.details] - Batch or financial breakdown
 * @param {string} [options.confirmText='Confirm'] - Confirm button label
 * @param {string} [options.cancelText='Cancel'] - Cancel button label
 * @param {'primary'|'danger'|'warning'} [options.confirmVariant='primary'] - Button styling
 * @param {string} [options.icon='alertTriangle'] - Icon key
 * @param {boolean} [options.allowBackdropDismiss=true] - Close on outside click
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog({
  title = 'Confirmation Required',
  message = '',
  details = null,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'primary',
  icon = 'alertTriangle',
  allowBackdropDismiss = true,
}) {
  return new Promise((resolve) => {
    // If an existing dialog is open, reject/resolve it cleanly
    if (activeDialogResolve) {
      activeDialogResolve(false);
      activeDialogResolve = null;
    }

    previousFocusedElement = document.activeElement;

    let overlay = document.getElementById('global-confirm-dialog');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'global-confirm-dialog';
      overlay.className = 'modal-overlay dialog-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      document.body.appendChild(overlay);
    }

    activeDialogResolve = resolve;

    const iconSvg =
      icon === 'danger' || confirmVariant === 'danger'
        ? icons.trash || icons.alertCircle
        : icon === 'warning' || confirmVariant === 'warning'
        ? icons.alertTriangle
        : icon === 'store'
        ? icons.store
        : icon === 'truck'
        ? icons.truck
        : icon === 'check'
        ? icons.check
        : icons.info;

    const iconColor =
      confirmVariant === 'danger'
        ? 'var(--danger)'
        : confirmVariant === 'warning'
        ? 'var(--warning)'
        : 'var(--primary)';

    const iconBg =
      confirmVariant === 'danger'
        ? 'var(--danger-subtle)'
        : confirmVariant === 'warning'
        ? 'var(--warning-subtle)'
        : 'var(--primary-subtle)';

    let detailsHtml = '';
    if (details) {
      if (typeof details === 'string') {
        detailsHtml = `<div class="dialog-details-box">${details}</div>`;
      } else if (Array.isArray(details)) {
        detailsHtml = `
          <div class="dialog-details-box">
            <dl class="dialog-details-list">
              ${details
                .map(
                  (d) => `
                <div class="dialog-detail-row">
                  <dt>${d.label}</dt>
                  <dd>${d.value}</dd>
                </div>
              `
                )
                .join('')}
            </dl>
          </div>
        `;
      }
    }

    const confirmBtnClass =
      confirmVariant === 'danger'
        ? 'btn btn-danger'
        : confirmVariant === 'warning'
        ? 'btn btn-warning'
        : 'btn btn-primary';

    overlay.innerHTML = `
      <div class="modal-content dialog-card" tabindex="-1">
        <div class="dialog-header">
          <div class="dialog-icon-badge" style="background: ${iconBg}; color: ${iconColor}; border: 1px solid ${iconColor};">
            ${iconSvg}
          </div>
          <div>
            <h3 class="dialog-title" id="dialog-title-text">${title}</h3>
            <p class="dialog-subtitle" id="dialog-desc-text">${message}</p>
          </div>
        </div>

        ${detailsHtml}

        <div class="dialog-actions">
          <button type="button" class="btn btn-secondary dialog-btn-cancel" id="dialog-cancel-btn">
            ${cancelText}
          </button>
          <button type="button" class="${confirmBtnClass} dialog-btn-confirm" id="dialog-confirm-btn">
            ${confirmText}
          </button>
        </div>
      </div>
    `;

    overlay.setAttribute('aria-labelledby', 'dialog-title-text');
    overlay.setAttribute('aria-describedby', 'dialog-desc-text');
    overlay.style.display = 'flex';

    const card = overlay.querySelector('.dialog-card');
    const confirmBtn = overlay.querySelector('#dialog-confirm-btn');
    const cancelBtn = overlay.querySelector('#dialog-cancel-btn');

    // Trap focus and support Escape
    const focusableElements = [cancelBtn, confirmBtn];
    confirmBtn.focus();

    function closeDialog(result) {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      document.removeEventListener('keydown', handleKeyDown);
      overlay.removeEventListener('click', handleBackdropClick);

      if (previousFocusedElement && typeof previousFocusedElement.focus === 'function') {
        try {
          previousFocusedElement.focus();
        } catch {}
      }

      if (activeDialogResolve) {
        activeDialogResolve(result);
        activeDialogResolve = null;
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDialog(false);
        return;
      }

      if (e.key === 'Tab') {
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    function handleBackdropClick(e) {
      if (allowBackdropDismiss && e.target === overlay) {
        closeDialog(false);
      }
    }

    confirmBtn.addEventListener('click', () => {
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      closeDialog(true);
    });

    cancelBtn.addEventListener('click', () => {
      closeDialog(false);
    });

    document.addEventListener('keydown', handleKeyDown);
    overlay.addEventListener('click', handleBackdropClick);
  });
}

window.showConfirmDialog = showConfirmDialog;

/**
 * Display a contextual warning/notice dialog when a workflow prerequisite is unmet.
 * Offers a direct shortcut action to fulfill the prerequisite.
 *
 * @param {object} options
 * @param {string} options.title - Dialog heading
 * @param {string} options.message - Explanation of prerequisite
 * @param {Array<{label: string, value: string}>|string} [options.details] - Details
 * @param {string} [options.actionText='Fulfill Prerequisite'] - Shortcut button label
 * @param {Function} [options.onAction] - Shortcut callback
 */
export function showPrerequisiteDialog({
  title = 'Prerequisite Action Required',
  message = '',
  details = null,
  actionText = 'Resolve Prerequisite',
  onAction = null,
}) {
  return showConfirmDialog({
    title,
    message,
    details,
    confirmText: actionText,
    cancelText: 'Dismiss',
    confirmVariant: 'primary',
    icon: 'alertTriangle',
  }).then((confirmed) => {
    if (confirmed && typeof onAction === 'function') {
      onAction();
    }
    return confirmed;
  });
}

window.showPrerequisiteDialog = showPrerequisiteDialog;
