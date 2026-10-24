;;; organice-pomodoro.el --- ORGanice: Pomodoro como en la app  -*- lexical-binding: t; -*-

;; (4.17) Como la herramienta Pomodoro de la app (4.13): un contador en la línea de estado
;; (🍅 24:59 trabajo, ☕ descanso). Al acabar un tramo avisa y espera a que empieces el siguiente.
;; Cada pomodoro de trabajo se guarda como un CLOCK en la tarea sin estado «Pomodoro» del fichero de
;; tareas (se crea si falta); solo si se ha trabajado al menos 1 minuto, y contando solo el tiempo
;; corrido (sin las pausas).
;;
;; C-c g % : empezar / pausar / seguir (y elegir saltar o parar desde el menú que sale).

(require 'org)
(require 'org-clock)
(require 'organice-core)

(defcustom organice-pomodoro-work 25 "Minutos de cada pomodoro." :type 'integer :group 'organice)
(defcustom organice-pomodoro-short 5 "Minutos del descanso corto." :type 'integer :group 'organice)
(defcustom organice-pomodoro-long 15 "Minutos del descanso largo." :type 'integer :group 'organice)
(defcustom organice-pomodoro-every 4 "Cada cuántos pomodoros toca el descanso largo."
  :type 'integer :group 'organice)
(defcustom organice-pomodoro-title "Pomodoro" "Tarea donde se guardan los CLOCK."
  :type 'string :group 'organice)

(defvar organice-pomodoro--status 'idle "idle, running, paused o waiting.")
(defvar organice-pomodoro--phase 'work "work, short o long.")
(defvar organice-pomodoro--count 0 "Pomodoros de trabajo terminados.")
(defvar organice-pomodoro--started nil "Inicio del tramo (para el CLOCK).")
(defvar organice-pomodoro--ends nil "Fin previsto (corriendo).")
(defvar organice-pomodoro--left nil "Segundos que quedan (en pausa o esperando).")
(defvar organice-pomodoro--worked 0 "Segundos corridos antes de la última pausa.")
(defvar organice-pomodoro--resumed nil "Cuándo se siguió por última vez.")
(defvar organice-pomodoro--timer nil)

(defconst organice-pomodoro--labels '((work . "Trabajo") (short . "Descanso corto") (long . "Descanso largo")))

(defun organice-pomodoro--minutes (phase)
  (pcase phase ('work organice-pomodoro-work) ('short organice-pomodoro-short) (_ organice-pomodoro-long)))

(defun organice-pomodoro--remaining ()
  (if (eq organice-pomodoro--status 'running)
      (max 0 (- organice-pomodoro--ends (float-time)))
    (or organice-pomodoro--left (* 60 (organice-pomodoro--minutes organice-pomodoro--phase)))))

(defun organice-pomodoro--mode-line ()
  (unless (eq organice-pomodoro--status 'idle)
    (let* ((s (ceiling (organice-pomodoro--remaining)))
           (txt (format "%s %d:%02d%s " (if (eq organice-pomodoro--phase 'work) "🍅" "☕")
                        (/ s 60) (% s 60)
                        (pcase organice-pomodoro--status ('paused " ⏸") ('waiting " ▶?") (_ "")))))
      (propertize txt 'face (if (eq organice-pomodoro--status 'running) 'warning 'shadow)
                  'help-echo "Pomodoro: C-c g %"))))

(defvar organice-pomodoro-mode-line '(:eval (organice-pomodoro--mode-line)))
(put 'organice-pomodoro-mode-line 'risky-local-variable t)
(unless (member 'organice-pomodoro-mode-line global-mode-string)
  (setq global-mode-string (append (or global-mode-string '("")) '(organice-pomodoro-mode-line))))

(defun organice-pomodoro--elapsed ()
  (+ organice-pomodoro--worked
     (if (and (eq organice-pomodoro--status 'running) organice-pomodoro--resumed)
         (- (float-time) organice-pomodoro--resumed) 0)))

(defun organice-pomodoro--log (start seconds)
  "CLOCK cerrado de START (segundos) durante SECONDS en la tarea «Pomodoro» del fichero de tareas."
  (when (>= seconds 60)
    (with-current-buffer (find-file-noselect (organice-tasks-path))
      (org-with-wide-buffer
       (goto-char (point-min))
       (let ((case-fold-search nil))
         (unless (re-search-forward (format "^\\* %s[ \t]*$" (regexp-quote organice-pomodoro-title)) nil t)
           (goto-char (point-max))
           (unless (bolp) (insert "\n"))
           (insert "* " organice-pomodoro-title "\n")
           (forward-line -1)
           (organice-set-created)))
       (org-back-to-heading t)
       (goto-char (let ((org-log-into-drawer t)) (org-log-beginning t)))
       (let* ((system-time-locale "C")
              (fmt (org-time-stamp-format t t))
              (mins (floor seconds 60)))
         (insert "CLOCK: " (format-time-string fmt start) "--"
                 (format-time-string fmt (+ start seconds))
                 (format " => %2d:%02d" (/ mins 60) (% mins 60)) "\n")))
      (save-buffer))))

(defun organice-pomodoro--tick ()
  (force-mode-line-update t)
  (when (and (eq organice-pomodoro--status 'running) (<= (organice-pomodoro--remaining) 0))
    (organice-pomodoro--finish)))

(defun organice-pomodoro--finish ()
  "Acaba el tramo: guarda el CLOCK si era de trabajo, avisa y espera al siguiente."
  (when (eq organice-pomodoro--phase 'work)
    (organice-pomodoro--log organice-pomodoro--started (organice-pomodoro--elapsed))
    (setq organice-pomodoro--count (1+ organice-pomodoro--count)))
  (setq organice-pomodoro--phase (if (eq organice-pomodoro--phase 'work)
                                     (if (zerop (% organice-pomodoro--count (max 2 organice-pomodoro-every)))
                                         'long 'short)
                                   'work)
        organice-pomodoro--status 'waiting
        organice-pomodoro--left (* 60 (organice-pomodoro--minutes organice-pomodoro--phase))
        organice-pomodoro--worked 0)
  (ding)
  (message "🍅 Tramo terminado. Siguiente: %s (C-c g %% para empezar)"
           (alist-get organice-pomodoro--phase organice-pomodoro--labels)))

(defun organice-pomodoro--run (seconds)
  (setq organice-pomodoro--status 'running
        organice-pomodoro--resumed (float-time)
        organice-pomodoro--ends (+ (float-time) seconds))
  (unless organice-pomodoro--timer
    (setq organice-pomodoro--timer (run-at-time 1 1 #'organice-pomodoro--tick))))

(defun organice-pomodoro-stop ()
  "Para el Pomodoro (guarda lo trabajado del tramo de trabajo, si llega a 1 minuto)."
  (interactive)
  (when (and (eq organice-pomodoro--phase 'work) (memq organice-pomodoro--status '(running paused)))
    (organice-pomodoro--log organice-pomodoro--started (organice-pomodoro--elapsed)))
  (when organice-pomodoro--timer (cancel-timer organice-pomodoro--timer))
  (setq organice-pomodoro--timer nil organice-pomodoro--status 'idle organice-pomodoro--phase 'work
        organice-pomodoro--count 0 organice-pomodoro--left nil organice-pomodoro--worked 0)
  (force-mode-line-update t)
  (message "Pomodoro parado"))

(defun organice-pomodoro-skip ()
  "Salta al tramo siguiente."
  (interactive)
  (organice-pomodoro--finish)
  (force-mode-line-update t))

(defun organice-pomodoro ()
  "Empieza, pausa o sigue el Pomodoro; con él en marcha, también saltar o parar."
  (interactive)
  (pcase organice-pomodoro--status
    ('idle
     (setq organice-pomodoro--phase 'work organice-pomodoro--count 0 organice-pomodoro--worked 0
           organice-pomodoro--started (float-time))
     (organice-pomodoro--run (* 60 organice-pomodoro-work))
     (message "🍅 Pomodoro de %d min" organice-pomodoro-work))
    ('waiting
     (setq organice-pomodoro--started (float-time) organice-pomodoro--worked 0)
     (organice-pomodoro--run organice-pomodoro--left)
     (message "%s" (alist-get organice-pomodoro--phase organice-pomodoro--labels)))
    (_
     (pcase (read-char-choice
             (format "Pomodoro (%s): [p] %s  [s] saltar  [x] parar  [q] nada "
                     (alist-get organice-pomodoro--phase organice-pomodoro--labels)
                     (if (eq organice-pomodoro--status 'running) "pausar" "seguir"))
             '(?p ?s ?x ?q))
       (?p (if (eq organice-pomodoro--status 'running)
               (setq organice-pomodoro--worked (organice-pomodoro--elapsed)
                     organice-pomodoro--left (organice-pomodoro--remaining)
                     organice-pomodoro--status 'paused)
             (organice-pomodoro--run organice-pomodoro--left)))
       (?s (organice-pomodoro-skip))
       (?x (organice-pomodoro-stop)))))
  (force-mode-line-update t))

(provide 'organice-pomodoro)
;;; organice-pomodoro.el ends here
