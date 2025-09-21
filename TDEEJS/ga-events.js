(function(){
  const safeOn = (id, type, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(type, fn, {passive:true});
  };
  const ev = (name, params={}) => {
    if (typeof gtag === 'function') gtag('event', name, params);
  };

  // Các nút sẵn có trong dự án của bạn:
  safeOn('btnTDEE', 'click',   () => ev('tdee_calculated'));
  safeOn('btnPlan', 'click',   () => ev('plan_attempt'));          // khi bấm Lập giáo án
  safeOn('btnLoginGoogle', 'click', () => ev('login_click'));      // click mở login
  safeOn('exportPDF', 'click', () => ev('vip_export_pdf'));
  safeOn('becomeVIPBtn', 'click', () => ev('vip_start_checkout'));

  // Khi trang vip.html mở
  if (location.pathname.endsWith('/vip.html')) ev('vip_page_open');
})();
