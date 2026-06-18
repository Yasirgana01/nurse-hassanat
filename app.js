const availabilityStorageKey = 'nurseHassanatAvailability';
  let paystackPublicKey = '';
  let availabilitySchedule = {};
  let displayedMonth = new Date();
  displayedMonth.setDate(1);
  let selectedAvailabilityDate = '';

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDisplayDate(key) {
    return parseDateKey(key).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function formatTimeSlot(slot) {
    let value = String(slot).trim().toLowerCase().replace(/\s+/g, '');
    value = value.replace(/^0(\d)/, '$1');
    value = value.replace(':00am', 'am').replace(':00pm', 'pm');
    return value;
  }

  function normalizeTimeSlots(value) {
    if (Array.isArray(value)) return value.map(formatTimeSlot).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map(formatTimeSlot).filter(Boolean);
    return [];
  }

  function getDefaultTimeSlots(date) {
    const day = date.getDay();
    if (day === 0) return [];
    if (day === 6) return ['4pm', '5pm'];
    return ['9am', '10am', '11am', '12pm', '1pm'];
  }

  function normalizeScheduleEntry(value, date) {
    if (typeof value === 'string') {
      return { status: value, timeSlots: value === 'available' ? getDefaultTimeSlots(date) : [] };
    }

    const status = value && value.status ? value.status : getDefaultStatus(date);
    const savedSlots = normalizeTimeSlots(value && (value.timeSlots || value.time_slots));
    return {
      status,
      timeSlots: status === 'available' ? (savedSlots.length ? savedSlots : getDefaultTimeSlots(date)) : []
    };
  }

  async function apiRequest(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const response = await fetch(path, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function loadLocalAvailabilitySchedule() {
    try {
      return JSON.parse(localStorage.getItem(availabilityStorageKey)) || {};
    } catch (error) {
      return {};
    }
  }

  function saveLocalAvailabilitySchedule(schedule) {
    localStorage.setItem(availabilityStorageKey, JSON.stringify(schedule));
  }

  async function loadAvailabilitySchedule() {
    try {
      const data = await apiRequest('/api/availability');
      availabilitySchedule = (data.availability || []).reduce((schedule, row) => {
        schedule[row.date] = { status: row.status, timeSlots: normalizeTimeSlots(row.time_slots) };
        return schedule;
      }, {});
      saveLocalAvailabilitySchedule(availabilitySchedule);
      return availabilitySchedule;
    } catch (error) {
      console.warn('Availability load failed. Using local fallback.', error);
      availabilitySchedule = loadLocalAvailabilitySchedule();
      return availabilitySchedule;
    }
  }

  function getDefaultStatus(date) {
    const day = date.getDay();
    return day === 0 ? 'unavailable' : 'available';
  }

  function getDateStatus(date, schedule) {
    return getDateEntry(date, schedule).status;
  }

  function getDateTimes(date, schedule) {
    return getDateEntry(date, schedule).timeSlots;
  }

  function getDateEntry(date, schedule) {
    const key = toDateKey(date);
    return normalizeScheduleEntry(schedule[key], date);
  }

  function renderAvailabilityCalendar() {
    const grid = document.getElementById('availability-calendar');
    const label = document.getElementById('calendar-month-label');
    if (!grid || !label) return;

    const todayKey = toDateKey(new Date());
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    label.textContent = displayedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    grid.innerHTML = '';

    for (let i = 0; i < firstDay.getDay(); i += 1) {
      const empty = document.createElement('div');
      empty.className = 'calendar-day is-empty';
      grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const key = toDateKey(date);
      const entry = getDateEntry(date, availabilitySchedule);
      const status = entry.status;
      const timePreview = entry.timeSlots.length ? entry.timeSlots.slice(0, 2).join(' - ') : '';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `calendar-day is-${status}`;
      if (key < todayKey) button.classList.add('is-past');
      if (key === selectedAvailabilityDate) button.classList.add('is-selected');
      button.setAttribute('aria-label', `${formatDisplayDate(key)} is ${status.replace('-', ' ')}`);
      button.innerHTML = `<span class="day-number">${day}</span><span><span class="day-status">${status === 'available' ? 'Open' : 'Closed'}</span>${timePreview ? `<span class="day-times">${escapeHtml(timePreview)}</span>` : ''}</span>`;
      button.addEventListener('click', () => selectAvailabilityDate(key, entry));
      grid.appendChild(button);
    }
  }

  function updateBookingTimeOptions(timeSlots) {
    const bookingTime = document.getElementById('b-time');
    if (!bookingTime) return;

    bookingTime.innerHTML = '';
    if (!timeSlots.length) {
      bookingTime.innerHTML = '<option value="">No time slots set</option>';
      return;
    }

    bookingTime.appendChild(new Option('Flexible / any available time', 'Flexible'));
    timeSlots.forEach(slot => bookingTime.appendChild(new Option(slot, slot)));
  }

  function handleBookingDateChange() {
    const bookingDate = document.getElementById('b-date');
    if (!bookingDate || !bookingDate.value) return;

    const date = parseDateKey(bookingDate.value);
    const entry = getDateEntry(date, availabilitySchedule);
    updateBookingTimeOptions(entry.status === 'available' ? entry.timeSlots : []);
  }

  function selectAvailabilityDate(key, entry) {
    selectedAvailabilityDate = key;
    const bookingDate = document.getElementById('b-date');
    const adminDate = document.getElementById('admin-date');
    const adminTimes = document.getElementById('admin-times');
    const note = document.getElementById('selected-date-note');
    const status = entry.status;
    const timeSlots = entry.timeSlots || [];

    if (bookingDate && status === 'available') bookingDate.value = key;
    if (adminDate) adminDate.value = key;
    if (adminTimes) adminTimes.value = timeSlots.join(', ');
    updateBookingTimeOptions(status === 'available' ? timeSlots : []);
    if (note) {
      note.innerHTML = status === 'available'
        ? `<strong>${formatDisplayDate(key)}</strong> has been added as your preferred booking date.${timeSlots.length ? `<div class="time-slot-list">${timeSlots.map(slot => `<span class="time-slot-pill">${escapeHtml(slot)}</span>`).join('')}</div>` : ''}`
        : `<strong>${formatDisplayDate(key)}</strong> is currently not available. Please choose another day.`;
    }

    renderAvailabilityCalendar();
  }

  function changeCalendarMonth(direction) {
    displayedMonth.setMonth(displayedMonth.getMonth() + direction);
    renderAvailabilityCalendar();
  }

  function enableNurseModeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('nurse') === '1') {
      document.body.classList.add('nurse-mode');
    }
  }

  function setNurseEditorState(isSignedIn) {
    const login = document.getElementById('nurse-login');
    const controls = document.getElementById('nurse-controls');
    if (login) login.style.display = isSignedIn ? 'none' : 'grid';
    if (controls) controls.classList.toggle('is-open', isSignedIn);
  }

  async function checkNurseSession() {
    try {
      await apiRequest('/api/admin-login', {
        method: 'POST',
        body: JSON.stringify({ checkSession: true }),
      });
      setNurseEditorState(true);
    } catch (error) {
      setNurseEditorState(false);
    }
  }

  async function signInNurse() {
    const note = document.getElementById('admin-note');
    const email = document.getElementById('nurse-email').value.trim();
    const password = document.getElementById('nurse-password').value;

    if (!email || !password) {
      alert('Please enter the nurse email and password.');
      return;
    }

    try {
      const data = await apiRequest('/api/admin-login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setNurseEditorState(true);
      if (note) note.textContent = 'Signed in. Changes are saved securely and shared with visitors.';
    } catch (error) {
      alert(error.message);
    }
  }

  async function signOutNurse() {
    await apiRequest('/api/admin-login', { method: 'DELETE' }).catch(() => {});
    setNurseEditorState(false);
  }

  function getSelectedAdminStatus() {
    const selected = document.querySelector('input[name="admin-status"]:checked');
    return selected ? selected.value : 'available';
  }

  function collectBookingDetails() {
    return {
      name: document.getElementById('b-name').value.trim(),
      phone: document.getElementById('b-phone').value.trim(),
      service: document.getElementById('b-service').value,
      type: document.getElementById('b-type').value,
      gender: document.getElementById('b-gender').value || 'No preference',
      date: document.getElementById('b-date').value || 'Flexible',
      time: document.getElementById('b-time').value || 'Flexible',
    };
  }

  function validateBookingDetails(details) {
    return details.name && details.phone && details.service && details.type;
  }

  function formatBookingDate(date) {
    return date === 'Flexible' ? date : formatDisplayDate(date);
  }

  async function createBooking(details, payment = {}) {
    const data = await apiRequest('/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        ...details,
        paymentStatus: payment.status || 'pending',
        paymentReference: payment.reference || '',
      }),
    });
    return data.booking;
  }

  async function markBookingPaid(reference, paymentReference) {
    const data = await apiRequest('/api/bookings', {
      method: 'PATCH',
      body: JSON.stringify({ reference, paymentReference }),
    });
    return data.booking;
  }

  async function saveAvailabilityDate() {
    const adminDate = document.getElementById('admin-date');
    const adminTimes = document.getElementById('admin-times');
    const note = document.getElementById('admin-note');
    if (!adminDate || !adminDate.value) {
      alert('Please choose a date to edit.');
      return;
    }

    const status = getSelectedAdminStatus();
    const timeSlots = status === 'available' ? normalizeTimeSlots(adminTimes ? adminTimes.value : '') : [];

    try {
      await apiRequest('/api/availability', {
        method: 'POST',
        body: JSON.stringify({ date: adminDate.value, status, timeSlots }),
      });
    } catch (error) {
      alert(error.message);
      return;
    }

    availabilitySchedule[adminDate.value] = { status, timeSlots };
    saveLocalAvailabilitySchedule(availabilitySchedule);
    selectedAvailabilityDate = adminDate.value;
    displayedMonth = parseDateKey(adminDate.value);
    displayedMonth.setDate(1);
    if (note) note.textContent = `${formatDisplayDate(adminDate.value)} saved as ${status === 'available' ? `available at ${timeSlots.length ? timeSlots.join(', ') : 'flexible times'}` : 'not available'}.`;
    renderAvailabilityCalendar();
  }

  async function clearAvailabilityDate() {
    const adminDate = document.getElementById('admin-date');
    if (!adminDate || !adminDate.value) {
      alert('Please choose a date to clear.');
      return;
    }

    try {
      await apiRequest('/api/availability', {
        method: 'DELETE',
        body: JSON.stringify({ date: adminDate.value }),
      });
    } catch (error) {
      alert(error.message);
      return;
    }

    delete availabilitySchedule[adminDate.value];
    saveLocalAvailabilitySchedule(availabilitySchedule);
    renderAvailabilityCalendar();
  }

  async function resetAvailabilitySchedule() {
    if (!confirm('Reset all saved availability changes?')) return;
    try {
      await apiRequest('/api/availability', {
        method: 'DELETE',
        body: JSON.stringify({ resetAll: true, confirmReset: 'RESET_AVAILABILITY' }),
      });
    } catch (error) {
      alert(error.message);
      return;
    }

    availabilitySchedule = {};
    saveLocalAvailabilitySchedule(availabilitySchedule);
    selectedAvailabilityDate = '';
    renderAvailabilityCalendar();
  }

  // WhatsApp booking form
  async function sendToWhatsApp() {
    const details = collectBookingDetails();

    if (!validateBookingDetails(details)) {
      alert('Please fill in all fields before sending.');
      return;
    }

    let booking;
    try {
      booking = await createBooking(details);
    } catch (error) {
      alert(error.message);
      return;
    }

    const msg =
      `Hi Nurse Hassanat!\n\nI'd like to book a consultation.\n\n` +
      `*Booking Reference:* ${booking.reference}\n` +
      `*Name:* ${details.name}\n` +
      `*Phone:* ${details.phone}\n` +
      `*Service:* ${details.service}\n` +
      `*Consultation type:* ${details.type}\n` +
      `*Preferred date:* ${formatBookingDate(details.date)}\n` +
      `*Preferred time:* ${details.time}\n` +
      `*Provider preference:* ${details.gender}\n\n` +
      `Please let me know your available slots. Thank you!`;

    window.open(`https://wa.me/2347018824561?text=${encodeURIComponent(msg)}`, '_blank');
  }

  // Paystack payment
  async function payWithPaystack() {
    const details = collectBookingDetails();

    if (!validateBookingDetails(details)) {
      alert('Please fill in all fields before proceeding to payment.');
      return;
    }

    // Service prices mapping
    const servicePrices = {
      'Reproductive & Sexual Health Consultation': 5000,
      'Antenatal / Postnatal Guidance': 5000,
      'Family Planning Consultation': 5000,
      'Chronic Disease Management (Hypertension/Diabetes)': 5000,
      'Nutrition & Lifestyle Counselling': 5000,
      'Health Education Session (Group)': 12000,
      'Mental Health Session': 7000,
      'General Health Q&A': 5000
    };

    const amount = servicePrices[details.service] || 5000;

    if (!paystackPublicKey) {
      alert('Online payment is not configured yet. Please use WhatsApp or bank transfer.');
      return;
    }

    let pendingBooking;
    try {
      pendingBooking = await createBooking(details);
    } catch (error) {
      alert(error.message);
      return;
    }

    const handler = PaystackPop.setup({
      key: paystackPublicKey,
      email: `${details.phone}@consultation.com`,
      amount: amount * 100, // Amount in kobo
      currency: 'NGN',
      ref: 'NH-' + Math.floor((Math.random() * 1000000000) + 1),
      onClose: function() {
        alert('Payment window closed.');
      },
      onSuccess: async function(response) {
        try {
          const verification = await apiRequest('/api/verify-payment', {
            method: 'POST',
            body: JSON.stringify({ reference: response.reference, service: details.service }),
          });

          const booking = await markBookingPaid(pendingBooking.reference, verification.reference);

          const confirmMsg =
            `Hi Nurse Hassanat!\n\nMy Paystack payment has been verified for my consultation.\n\n` +
            `*Booking Reference:* ${booking.reference}\n` +
            `*Name:* ${details.name}\n` +
            `*Phone:* ${details.phone}\n` +
            `*Service:* ${details.service}\n` +
            `*Consultation type:* ${details.type}\n` +
            `*Preferred date:* ${formatBookingDate(details.date)}\n` +
            `*Preferred time:* ${details.time}\n` +
            `*Provider preference:* ${details.gender}\n` +
            `*Verified Payment Reference:* ${verification.reference}\n\n` +
            `Please confirm my booking. Thank you!`;

          window.open(`https://wa.me/2347018824561?text=${encodeURIComponent(confirmMsg)}`, '_blank');
          alert('Payment verified! Please confirm your booking on WhatsApp.');
        } catch (error) {
          alert('Payment was received by Paystack but could not be verified here yet. Please contact Nurse Hassanat with your Paystack reference: ' + response.reference);
        }
      }
    });
    handler.openIframe();
  }

  // FAQ accordion
  function toggleFaq(btn) {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  }

  // Footer disclosure toggles
  function toggleFooterDisclosure(btn) {
    const policy = document.getElementById(btn.getAttribute('aria-controls'));
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!isOpen));
    policy.hidden = isOpen;
  }

  function togglePrivacyPolicy(btn) {
    toggleFooterDisclosure(btn);
  }

  // Scroll reveal
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } }),
    { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
  );

  async function initPage() {
    enableNurseModeFromUrl();
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    document.getElementById('calendar-prev')?.addEventListener('click', () => changeCalendarMonth(-1));
    document.getElementById('calendar-next')?.addEventListener('click', () => changeCalendarMonth(1));
    document.getElementById('nurse-sign-in')?.addEventListener('click', signInNurse);
    document.getElementById('nurse-sign-out')?.addEventListener('click', signOutNurse);
    document.getElementById('availability-save')?.addEventListener('click', saveAvailabilityDate);
    document.getElementById('availability-clear')?.addEventListener('click', clearAvailabilityDate);
    document.getElementById('availability-reset')?.addEventListener('click', resetAvailabilitySchedule);
    document.getElementById('send-whatsapp')?.addEventListener('click', sendToWhatsApp);
    document.getElementById('pay-paystack')?.addEventListener('click', payWithPaystack);
    document.querySelectorAll('.faq-q').forEach(btn => btn.addEventListener('click', () => toggleFaq(btn)));
    document.querySelectorAll('.footer-policy-toggle').forEach(btn => btn.addEventListener('click', () => toggleFooterDisclosure(btn)));
    try {
      const config = await apiRequest('/api/config');
      paystackPublicKey = config.paystackPublicKey || '';
    } catch (error) {
      paystackPublicKey = '';
    }
    await loadAvailabilitySchedule();
    await checkNurseSession();
    const bookingDate = document.getElementById('b-date');
    if (bookingDate) bookingDate.addEventListener('change', handleBookingDateChange);
    renderAvailabilityCalendar();
  }

  initPage();
