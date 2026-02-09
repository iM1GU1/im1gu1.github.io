document.addEventListener('DOMContentLoaded', () => {
    // IntersectionObserver to reveal elements on scroll
    const animateElements = document.querySelectorAll('.animate');
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const observerOptions = {
        threshold: isMobile ? 0.08 : 0.2,
        rootMargin: isMobile ? '0px 0px 200px 0px' : '0px 0px 0px 0px'
    };
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                obs.unobserve(entry.target);
            }
        });
    }, observerOptions);

    animateElements.forEach(el => {
        observer.observe(el);
    });

    // Mobile navigation toggle
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (navToggle) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('open');
        });
    }

    // Close nav on link click (mobile)
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
        });
    });

    // Change nav background on scroll
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 10) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Reservation widget
    const widget = document.querySelector('.reservation-widget');
    if (widget) {
        initReservationWidget(widget);
    }
});

function initReservationWidget(widget) {
    const apiBaseRaw = widget.dataset.apiBase || '';
    const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw.slice(0, -1) : apiBaseRaw;
    const restaurantSlug = widget.dataset.restaurant || '';

    const calendarTitle = widget.querySelector('.calendar-title');
    const calendarDays = widget.querySelector('.calendar-days');
    const prevBtn = widget.querySelector('[data-dir="prev"]');
    const nextBtn = widget.querySelector('[data-dir="next"]');
    const selectedDateText = widget.querySelector('.selected-date');

    const partyInput = widget.querySelector('#party-size');
    const slotsContainer = widget.querySelector('#slots-container');
    const availabilityMessage = widget.querySelector('#availability-message');
    const form = widget.querySelector('#reservation-form');
    const formStatus = widget.querySelector('.form-status');
    const submitButton = widget.querySelector('.reservation-submit');

    let currentMonth = new Date();
    currentMonth.setDate(1);

    let selectedDate = null;
    let selectedTime = null;
    const dateStatus = new Map();

    renderCalendar();

    prevBtn.addEventListener('click', () => {
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        renderCalendar();
    });

    nextBtn.addEventListener('click', () => {
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
        renderCalendar();
    });

    const partyHandler = () => {
        if (selectedDate) {
            fetchAvailability();
        }
    };

    partyInput.addEventListener('change', partyHandler);
    partyInput.addEventListener('input', partyHandler);

    calendarDays.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-date]');
        if (!button || button.disabled) return;

        selectedDate = button.dataset.date;
        selectedTime = null;
        clearSelectedSlot();
        updateSelectedDateText();
        renderCalendar();

        if (partyInput.value) {
            fetchAvailability();
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!selectedDate || !selectedTime) {
            setFormStatus('Selecciona una fecha y una hora disponible.', true);
            return;
        }

        const party = Number(partyInput.value || 0);
        if (!party) {
            setFormStatus('Selecciona el numero de personas.', true);
            return;
        }

        submitButton.disabled = true;
        setFormStatus('Confirmando reserva...', false);

        const payload = {
            restaurant: restaurantSlug || undefined,
            date: selectedDate,
            time: selectedTime,
            party,
            name: form.querySelector('input[name="name"]').value.trim(),
            email: form.querySelector('input[name="email"]').value.trim(),
            phone: form.querySelector('input[name="phone"]').value.trim(),
            notes: form.querySelector('textarea[name="notes"]').value.trim()
        };

        try {
            const response = await fetch(`${apiBase}/api/book`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (data.ok) {
                setFormStatus('Reserva confirmada. Te esperamos!', false);
                form.reset();
                selectedTime = null;
                clearSelectedSlot();
            } else if (data.reason === 'NO_AVAILABILITY') {
                setFormStatus('No hay disponibilidad en esa hora. Elige otra.', true);
                fetchAvailability();
            } else {
                setFormStatus('No se pudo completar la reserva. Intenta de nuevo.', true);
            }
        } catch (error) {
            setFormStatus('Error de conexion. Intenta mas tarde.', true);
        } finally {
            submitButton.disabled = false;
        }
    });

    function renderCalendar() {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const monthName = currentMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        calendarTitle.textContent = capitalize(monthName);

        calendarDays.innerHTML = '';

        const firstDay = new Date(year, month, 1);
        const startOffset = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < startOffset; i += 1) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day empty';
            calendarDays.appendChild(empty);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let day = 1; day <= daysInMonth; day += 1) {
            const dateObj = new Date(year, month, day);
            const dateIso = formatDateISO(dateObj);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'calendar-day';
            button.textContent = day;
            button.dataset.date = dateIso;

            if (dateObj < today) {
                button.disabled = true;
                button.classList.add('disabled');
            }

            if (selectedDate === dateIso) {
                button.classList.add('selected');
            }

            const status = dateStatus.get(dateIso);
            if (status === 'unavailable') {
                button.classList.add('unavailable');
            }
            if (status === 'available') {
                button.classList.add('available');
            }

            calendarDays.appendChild(button);
        }
    }

    function updateSelectedDateText() {
        if (!selectedDate) {
            selectedDateText.textContent = 'Selecciona un dia para ver disponibilidad.';
            return;
        }
        const dateObj = new Date(`${selectedDate}T00:00:00`);
        const readable = dateObj.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        selectedDateText.textContent = `Dia seleccionado: ${capitalize(readable)}.`;
    }

    async function fetchAvailability() {
        if (!selectedDate) return;

        const party = Number(partyInput.value || 0);
        if (!party) return;

        availabilityMessage.textContent = 'Consultando disponibilidad...';
        availabilityMessage.classList.remove('error');
        slotsContainer.innerHTML = '';
        clearSelectedSlot();

        const params = new URLSearchParams({
            date: selectedDate,
            party: String(party)
        });
        if (restaurantSlug) {
            params.set('restaurant', restaurantSlug);
        }

        try {
            const response = await fetch(`${apiBase}/api/availability?${params.toString()}`);
            const data = await response.json();
            if (!data.ok) {
                availabilityMessage.textContent = 'No se pudo cargar la disponibilidad.';
                availabilityMessage.classList.add('error');
                return;
            }

            renderSlots(data.turnos || []);
            const availableCount = countAvailableSlots(data.turnos || []);
            if (availableCount === 0) {
                dateStatus.set(selectedDate, 'unavailable');
                availabilityMessage.textContent = `No hay disponibilidad para ${party} personas el ${selectedDate}.`;
                availabilityMessage.classList.add('error');
                if (data.next_available) {
                    availabilityMessage.textContent += ` Proxima disponibilidad: ${data.next_available.date} a las ${data.next_available.time} (${data.next_available.turno}).`;
                }
            } else {
                dateStatus.set(selectedDate, 'available');
                availabilityMessage.textContent = `Selecciona una hora disponible para ${party} personas.`;
                availabilityMessage.classList.remove('error');
            }
            renderCalendar();
        } catch (error) {
            availabilityMessage.textContent = 'Error consultando disponibilidad.';
            availabilityMessage.classList.add('error');
        }
    }

    function renderSlots(turnos) {
        slotsContainer.innerHTML = '';

        turnos.forEach((turno) => {
            const group = document.createElement('div');
            group.className = 'slots-group';

            const title = document.createElement('h4');
            title.textContent = turno.turno;
            group.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'slots-grid';

            turno.slots.forEach((slot) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = slot.time;
                button.className = 'slot-btn';
                button.dataset.time = slot.time;

                if (!slot.available) {
                    button.disabled = true;
                    button.classList.add('unavailable');
                } else {
                    button.classList.add('available');
                    button.addEventListener('click', () => {
                        selectedTime = slot.time;
                        highlightSelectedSlot(button);
                        setFormStatus(`Hora seleccionada: ${slot.time}.`, false);
                    });
                }

                grid.appendChild(button);
            });

            group.appendChild(grid);
            slotsContainer.appendChild(group);
        });
    }

    function highlightSelectedSlot(selectedButton) {
        widget.querySelectorAll('.slot-btn.selected').forEach((button) => {
            button.classList.remove('selected');
        });
        selectedButton.classList.add('selected');
    }

    function clearSelectedSlot() {
        widget.querySelectorAll('.slot-btn.selected').forEach((button) => {
            button.classList.remove('selected');
        });
    }

    function countAvailableSlots(turnos) {
        return turnos.reduce((count, turno) => {
            const available = turno.slots.filter((slot) => slot.available).length;
            return count + available;
        }, 0);
    }

    function setFormStatus(message, isError) {
        formStatus.textContent = message;
        formStatus.classList.toggle('error', isError);
    }

    function formatDateISO(dateObj) {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function capitalize(text) {
        if (!text) return text;
        return text.charAt(0).toUpperCase() + text.slice(1);
    }
}
