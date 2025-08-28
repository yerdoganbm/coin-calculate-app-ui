package tr.gov.tcmb.ogmdfif.service.impl;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tr.gov.tcmb.log.logger.PlatformLogger;
import tr.gov.tcmb.log.logger.PlatformLoggerFactory;
import tr.gov.tcmb.ogmdfif.constant.*;
import tr.gov.tcmb.ogmdfif.exception.ValidationException;
import tr.gov.tcmb.ogmdfif.model.dto.EftSube;
import tr.gov.tcmb.ogmdfif.model.dto.KararDTO;
import tr.gov.tcmb.ogmdfif.model.dto.SgkBorcTahsilat;
import tr.gov.tcmb.ogmdfif.model.entity.*;
import tr.gov.tcmb.ogmdfif.service.*;
import tr.gov.tcmb.ogmdfif.util.Constants;
import tr.gov.tcmb.ogmdfif.ws.client.MuhasebeClientService;
import tr.gov.tcmb.ogmdfif.ws.client.SgkClientService;
import tr.gov.tcmb.ogmdfif.ws.response.SgkResponse;
import tr.gov.tcmb.ogmdfif.ws.response.SgkTahsilatKaydetResult;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service("borcIslemleriService")
@Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = {Exception.class})
public class BorcIslemleriServiceImpl implements BorcIslemleriService {
    private static final PlatformLogger logger = PlatformLoggerFactory.getLogger(BorcIslemleriServiceImpl.class);

    @Autowired
    protected SorgulananBorcBilgiService sorgulananBorcBilgiService;
    @Autowired
    protected SorgulananBorcBilgiTahakkukService sorgulananBorcBilgiTahakkukService;
    @Autowired
    protected ProvizyonTalepService provizyonTalepService;
    @Autowired
    protected ProvizyonIslemleriService provizyonIslemleriService;
    @Autowired
    protected BorcBilgiService borcBilgisiService;
    @Autowired
    protected TahakkukIslemleriService tahakkukIslemleriService;
    @Autowired
    protected BankaSubeService bankaSubeService;
    @Autowired
    protected AnlikBorcService anlikBorcService;
    @Autowired
    protected MailService mailService;
    @Autowired
    protected MuhasebeClientService muhasebeClientService;
    @Autowired
    protected GibBorcSorguService gibBorcSorguService;
    @Autowired
    protected KararIslemleriService kararIslemleriService;
    @Autowired
    private SgkClientService sgkClientService;

    public static DecimalFormat df = new DecimalFormat("#,##0.00", new DecimalFormatSymbols(Locale.ITALIAN));

    private static BigDecimal toplamSgkTahsilatTutarim = BigDecimal.ZERO;
    private static BigDecimal toplamGibTahsilatTutarim = BigDecimal.ZERO;

    public static final BigDecimal ONE_HUNDRED = new BigDecimal(100);

    private static Set<Long> bugunkuTumTahakkukIdSet = new HashSet<>();
    private static Set<Long> kontrolEdilmisOdenebilirTahakkukIdSet = new HashSet<>();
    private static Set<Long> kontrolEdilmisOdenemezTahakkukIdSet = new HashSet<>();

    @Scheduled(cron = "0 0 9-12 * * MON-FRI")
    // Shedlock olMAyacak!
    public void staticleriSifirla() {
        logger.info("BorcIslemleriServiceImpl","staticleriSifirla");
        bugunkuTumTahakkukIdSet.clear();
        kontrolEdilmisOdenebilirTahakkukIdSet.clear();
        kontrolEdilmisOdenemezTahakkukIdSet.clear();
        toplamGibTahsilatTutarim = BigDecimal.ZERO;
        toplamSgkTahsilatTutarim = BigDecimal.ZERO;
    }

    @Override
    public void borclariHakediseGoreDagit() throws Exception {
        // Borçları dağıtırken bir ihracatçı için belirlenecek toplam hakediş, bütün ihracatçılarının borç bilgisi belli
        // olan tahakkuklardaki ilgili ihracaçı için hakedişlerin toplanmasıyla elde edilir.
        Date bugun = new Date();
        List<SorgulananBorcBilgi> sorgulananBorcBilgiList = sorgulananBorcBilgiService
                .getSorgulananBorcBilgiListByDurum(bugun, SorgulananBorcDurumEnum.BORC_DAGITIMI_BEKLIYOR, 0);
        List<SorgulananBorcBilgi> borclarHakediseGoreDagitilmamisOlanlar = sorgulananBorcBilgiList.stream().
                filter(sorgulananBorcBilgi -> (!sorgulananBorcBilgi.getBorclarHakediseGoreDagitildi())).limit(200).collect(Collectors.toList());
        Set<Long> kontrolEdilmisOdenebilirDurumdakiTahakkukSet = new HashSet<>();
        Set<Long> kontrolEdilmisOdenemezDurumdakiTahakkukSet = new HashSet<>();
        for (SorgulananBorcBilgi sorgulananBorcBilgi : borclarHakediseGoreDagitilmamisOlanlar) {
            try {
                logger.info("BorcIslemleriServiceImpl","Islenen SBB ID: " + sorgulananBorcBilgi.getId());
                //Alt satırda amaç bir ihracatçının o günkü farklı farklı tahakkuklardaki toplam hakediş miktarının belirlenmesi.
                //SorgulananBorcBilgiTahakkuk tablosu borcu sorgulananan ilgili ihracatçının hakedişlerinin hangi tahakkuklarda olduğunu tutar.
                List<SorgulananBorcBilgiTahakkuk> sorgulananBorcBilgiTahakkukList = sorgulananBorcBilgiTahakkukService.getSorgulananBorcBilgiTahakkukList(sorgulananBorcBilgi.getId());
                List<Long> tahakkukIdList = getOdenmemisTahakkukIdList(sorgulananBorcBilgiTahakkukList);
                List<Long> odenebilirTahakkukIdList = new ArrayList<>();
                for(Long tahakkukId : tahakkukIdList) {
                    if(kontrolEdilmisOdenebilirDurumdakiTahakkukSet.contains(tahakkukId)) {
                        // Kontrol edilmiş ve ödenebilir durumda olduğu için odenebilirTahakkukIdList'e ekleniyor
                        odenebilirTahakkukIdList.add(tahakkukId);
                    } else if(!kontrolEdilmisOdenemezDurumdakiTahakkukSet.contains(tahakkukId)) {
                        List<Long> kontrolSonucu = filterOdenebilirDurumdakiTahakkukList(tahakkukId);
                        // Buradaki kontrol sonucuna göre ödenmiş veya ödenemez durumdaki setlere ekleniyor.
                        if(kontrolSonucu.isEmpty()) {
                            kontrolEdilmisOdenemezDurumdakiTahakkukSet.add(tahakkukId);
                        } else {
                            kontrolEdilmisOdenebilirDurumdakiTahakkukSet.add(tahakkukId);
                            //  Eğer ödenebilir durumdaysa ayrıca odenebilirTahakkukIdList'e ekleniyor
                            odenebilirTahakkukIdList.add(tahakkukId);
                        }
                    }
                }
                List<Provizyon> provizyonList = provizyonIslemleriService.getProvizyonList(odenebilirTahakkukIdList, sorgulananBorcBilgi.getVkn(), sorgulananBorcBilgi.getTckn());
                // *** Hakedişleri büyükten küçüğe göre sıralamanın getirisi, daha az borç eft'si göndermiş.
                // Yani borçlerı olabildiğince çok sayıda eft'ye bölmeden mümkünse tek parça halinde gönderebilmek.
                // SGK borçları zaten bütün ihracatçılar için, her ihracatçının borcunun toplamını içerecek şekilde
                // tek bir eft gönderilmesi suretiyle gerçekleştirilir. O halde borçları provizyonlarla eşleştirirken
                // SGK borçlarından ziyade GİB borçlarına dikkate alırsak, GİB için daha az eft göndermiş oluruz.
                provizyonListesiniMiktaraGoreBuyuktenKucugeSirala(provizyonList);

                BigDecimal toplamSgkBorcu = sorgulananBorcBilgi.getToplamSgkBorcu();
                BigDecimal toplamGibBorcu = sorgulananBorcBilgi.getToplamGibBorcu();

                BigDecimal anlikTaraftanOdenecekGibBorcu = BigDecimal.ZERO;
                BigDecimal anlikTaraftanOdenecekSgkBorcu = BigDecimal.ZERO;
                List<AnlikBorc> anlikBorcList = anlikBorcService.getAnlikBorcList(bugun, sorgulananBorcBilgi.getTckn(), sorgulananBorcBilgi.getVkn());
                for (AnlikBorc anlikBorc : anlikBorcList) {
                    if(anlikBorc.getIslemDurum().equals(AnlikBorcDurumEnum.TAHSILAT_BEKLIYOR.getKod())) {
                        if(anlikBorc.getBorcTip().equals(BorcTipEnum.SGK.getKod())){
                            anlikTaraftanOdenecekSgkBorcu = anlikBorc.getOdenecekTutar();
                        }else if(anlikBorc.getBorcTip().equals(BorcTipEnum.GIB.getKod())){
                            anlikTaraftanOdenecekGibBorcu = anlikBorc.getOdenecekTutar();
                        }
                    }
                }
                BigDecimal odenecekSgkBorcuForProvizyonList = toplamSgkBorcu.subtract(anlikTaraftanOdenecekSgkBorcu);
                BigDecimal odenecekGibBorcuForProvizyonList = toplamGibBorcu.subtract(anlikTaraftanOdenecekGibBorcu);
                BigDecimal toplamBorc = odenecekGibBorcuForProvizyonList.add(odenecekSgkBorcuForProvizyonList);
                logger.info("BorcIslemleriServiceImpl","SBB ID: " + sorgulananBorcBilgi.getId() + " odenecekSgkBorcuForProvizyonList: " + odenecekSgkBorcuForProvizyonList.toPlainString()
                        + " odenecekGibBorcuForProvizyonList: " + odenecekGibBorcuForProvizyonList.toPlainString() + " toplamBorc: " + toplamBorc.toPlainString());
                if(toplamBorc.compareTo(BigDecimal.ZERO) <= 0){
                    sorgulananBorcBilgi.setOdenecekSgkBorcu(odenecekSgkBorcuForProvizyonList);
                    sorgulananBorcBilgi.setOdenecekGibBorcu(odenecekGibBorcuForProvizyonList);
                    sorgulananBorcBilgi.setBorclarHakediseGoreDagitildi(true);
                    sorgulananBorcBilgiService.kaydet(sorgulananBorcBilgi);
                    continue;
                }
                BigDecimal odenecekToplamBorcForProvizyonList;
                if(!provizyonList.isEmpty()){
                    boolean isMahsupTahakkukuVar = isMahsupTahakkukuVar(sorgulananBorcBilgiTahakkukList);
                    logger.info("BorcIslemleriServiceImpl","SBB ID: " + sorgulananBorcBilgi.getId() + " isMahsupTahakkukuVar: " + isMahsupTahakkukuVar);
                    BigDecimal provizyonListesindekiToplamHakedis = getToplamTutarInProvizyonListesi(provizyonList);
                    logger.info("BorcIslemleriServiceImpl","SBB ID: " + sorgulananBorcBilgi.getId() + " provizyonListesindekiToplamHakedis: " + provizyonListesindekiToplamHakedis.toPlainString());
                    // Yukarda *** ile anlatılan yerdeki hususun gerçekleşmesi için öncelikli olarak GİB'in borçları en
                    // yüksek hakdeşli provizyonlara yedirilmeli. Gib bittikten sonra SGK borçlarını dağıtmalıyız.
                    // Örnek: Bir ihracatçının hakedişleri: 100, 150, 50, 200
                    // Gib borcu: 250, SGK borcu: 250
                    // Şayet SGK'yı öncelikli olarak dağıtmaya başlarsam dağıtım şu şekilde olacak
                    // 200'lük hakeşin tamamı SGK borcuna gidecek 150'lik hakedişin 50'si SGK'ya gidecek.
                    // Geri kalan GİB borcu için 150'lik hakedişte 100'lük bir borç olacak.
                    // 100'lük hakedişin ve 50'lik hakedişin tamamı borca gidecek. Toplamda 100, 100 ve 50 olmak üzere
                    // 3 adet gib eft'si gönderilecek.
                    if(!isMahsupTahakkukuVar){
                        if (provizyonListesindekiToplamHakedis.compareTo(toplamBorc) < 0) {
                            // Toplam Borç (SGK+GİB) hakedişten fazlaysa
                            // Hakediş 10 bin, sgk borcu: 30 bin, gib: 20 bin diyelim
                            // 10 binlik hakedişin 6 bini sgkya 4 bini gibe gitmeli
                            odenecekToplamBorcForProvizyonList = provizyonListesindekiToplamHakedis;
                            BigDecimal proportionOfSgk = odenecekSgkBorcuForProvizyonList.multiply(ONE_HUNDRED).divide(toplamBorc, 15, RoundingMode.HALF_UP);
                            odenecekSgkBorcuForProvizyonList = proportionOfSgk.multiply(odenecekToplamBorcForProvizyonList).divide(ONE_HUNDRED, 2, RoundingMode.HALF_UP);
                            odenecekGibBorcuForProvizyonList = odenecekToplamBorcForProvizyonList.subtract(odenecekSgkBorcuForProvizyonList);
                            logger.info("BorcIslemleriServiceImpl","SBB ID: " + sorgulananBorcBilgi.getId()
                                    + " MAHSUP YOK odenecekToplamBorcForProvizyonList: " + odenecekToplamBorcForProvizyonList.toPlainString()
                                    + " odenecekSgkBorcuForProvizyonList: " + odenecekSgkBorcuForProvizyonList.toPlainString()
                                    + " odenecekGibBorcuForProvizyonList: " + odenecekGibBorcuForProvizyonList.toPlainString());
                        }
                        if (odenecekSgkBorcuForProvizyonList.compareTo(sorgulananBorcBilgi.getToplamSgkBorcu()) > 0){
                            handleBorcDagitimHatasi(sorgulananBorcBilgi);
                            throw new ValidationException(sorgulananBorcBilgi.getVKnTckN() + " nolu TCKN/VKN için ödenecek SGK borcu: " + odenecekSgkBorcuForProvizyonList + " SGK'dan dönen toplam borç: " + sorgulananBorcBilgi.getToplamSgkBorcu());
                        }
                        sorgulananBorcBilgi.setOdenecekSgkBorcu(odenecekSgkBorcuForProvizyonList);
                        if (odenecekGibBorcuForProvizyonList.compareTo(sorgulananBorcBilgi.getToplamGibBorcu()) > 0){
                            handleBorcDagitimHatasi(sorgulananBorcBilgi);
                            throw new ValidationException(sorgulananBorcBilgi.getVKnTckN() + " nolu TCKN/VKN için ödenecek GİB borcu: " + odenecekGibBorcuForProvizyonList + " GİB'den dönen toplam borç: " + sorgulananBorcBilgi.getToplamGibBorcu());
                        }
                        sorgulananBorcBilgi.setOdenecekGibBorcu(odenecekGibBorcuForProvizyonList);
                        // Aşağıdaki borç bilgisi kaydet ekstra teste muhtaç
                        try {
                            borcBilgisiKaydet(provizyonList, odenecekSgkBorcuForProvizyonList, odenecekGibBorcuForProvizyonList, sorgulananBorcBilgi);
                        } catch (Exception e) {
                            throw new RuntimeException(e.getMessage());
                        }
                        sorgulananBorcBilgi.setBorclarHakediseGoreDagitildi(true);
                        sorgulananBorcBilgiService.kaydet(sorgulananBorcBilgi);
                    }else {
                        List<Provizyon> mahsupProvizyonList = new ArrayList<>();
                        List<Provizyon> mahsupDisiProvizyonList = new ArrayList<>();
                        for (Provizyon provizyon : provizyonList) {
                            if(provizyon.getKarar().isMahsupKarar()){
                                mahsupProvizyonList.add(provizyon);
                            }else{
                                mahsupDisiProvizyonList.add(provizyon);
                            }
                        }
                        BigDecimal provizyonListesindekiMahsupToplamHakedis = getToplamTutarInMahsupProvizyonListesi(provizyonList);
                        // mahsup tamamen sgk'ya yedirilmeli.
                        BigDecimal mahsupTarafindanOdenecekSgkBorcuForProvizyonList;
                        if(provizyonListesindekiMahsupToplamHakedis.compareTo(odenecekSgkBorcuForProvizyonList) < 0){
                            // tüm mahsup hakedişi sgk borcuna gidecek ve hala sgk borcu kalmaya devam edecek.
                            mahsupTarafindanOdenecekSgkBorcuForProvizyonList = provizyonListesindekiMahsupToplamHakedis;
                        }else{
                            mahsupTarafindanOdenecekSgkBorcuForProvizyonList = odenecekSgkBorcuForProvizyonList;
                        }
                        try {
                            borcBilgisiKaydet(mahsupProvizyonList, mahsupTarafindanOdenecekSgkBorcuForProvizyonList, BigDecimal.ZERO, sorgulananBorcBilgi);
                        } catch (Exception e) {
                            throw new RuntimeException(e.getMessage());
                        }

                        logger.info("BorcIslemleriServiceImpl","SBB ID: " + sorgulananBorcBilgi.getId()
                                + " MAHSUP VAR provizyonListesindekiMahsupToplamHakedis: " + provizyonListesindekiMahsupToplamHakedis.toPlainString()
                                + " mahsupTarafindanOdenecekSgkBorcuForProvizyonList: " + mahsupTarafindanOdenecekSgkBorcuForProvizyonList.toPlainString()
                                + " odenecekSgkBorcuForProvizyonList: " + odenecekSgkBorcuForProvizyonList.toPlainString());

                        odenecekSgkBorcuForProvizyonList = odenecekSgkBorcuForProvizyonList.subtract(mahsupTarafindanOdenecekSgkBorcuForProvizyonList);
                        toplamBorc = toplamBorc.subtract(mahsupTarafindanOdenecekSgkBorcuForProvizyonList);
                        BigDecimal mahsupOlmayanProvizyonListesindekiToplamHakedis = provizyonListesindekiToplamHakedis.subtract(provizyonListesindekiMahsupToplamHakedis);
                        logger.info("BorcIslemleriServiceImpl","SBB ID: " + sorgulananBorcBilgi.getId()
                                + " MAHSUP VAR odenecekSgkBorcuForProvizyonList: " + odenecekSgkBorcuForProvizyonList.toPlainString()
                                + " toplamBorc: " + toplamBorc.toPlainString()
                                + " mahsupOlmayanProvizyonListesindekiToplamHakedis: " + mahsupOlmayanProvizyonListesindekiToplamHakedis.toPlainString());

                        if (mahsupOlmayanProvizyonListesindekiToplamHakedis.compareTo(toplamBorc) < 0) {
                            // Toplam Borç (SGK+GİB) hakedişten fazlaysa
                            // Hakediş 10 bin, sgk borcu: 30 bin, gib: 20 bin diyelim
                            // 10 binlik hakedişin 6 bini sgkya 4 bini gibe gitmeli
                            odenecekToplamBorcForProvizyonList = mahsupOlmayanProvizyonListesindekiToplamHakedis;
                            BigDecimal proportionOfSgk = odenecekSgkBorcuForProvizyonList.multiply(ONE_HUNDRED).divide(toplamBorc, 15, RoundingMode.HALF_UP);
                            odenecekSgkBorcuForProvizyonList = proportionOfSgk.multiply(odenecekToplamBorcForProvizyonList).divide(ONE_HUNDRED, 2, RoundingMode.HALF_UP);
                            odenecekGibBorcuForProvizyonList = odenecekToplamBorcForProvizyonList.subtract(odenecekSgkBorcuForProvizyonList);
                            logger.info("BorcIslemleriServiceImpl","SBB ID: " + sorgulananBorcBilgi.getId()
                                    + " MAHSUP VAR odenecekToplamBorcForProvizyonList: " + odenecekToplamBorcForProvizyonList.toPlainString()
                                    + " odenecekSgkBorcuForProvizyonList: " + odenecekSgkBorcuForProvizyonList.toPlainString()
                                    + " odenecekGibBorcuForProvizyonList: " + odenecekGibBorcuForProvizyonList.toPlainString());
                        }
                        if (odenecekSgkBorcuForProvizyonList.compareTo(sorgulananBorcBilgi.getToplamSgkBorcu()) > 0){
                            handleBorcDagitimHatasi(sorgulananBorcBilgi);
                            throw new ValidationException(sorgulananBorcBilgi.getVKnTckN() + " nolu TCKN/VKN için ödenecek SGK borcu: " + odenecekSgkBorcuForProvizyonList + " SGK'dan dönen toplam borç: " + sorgulananBorcBilgi.getToplamSgkBorcu());
                        }
                        sorgulananBorcBilgi.setOdenecekSgkBorcu(odenecekSgkBorcuForProvizyonList.add(mahsupTarafindanOdenecekSgkBorcuForProvizyonList));
                        if (odenecekGibBorcuForProvizyonList.compareTo(sorgulananBorcBilgi.getToplamGibBorcu()) > 0){
                            handleBorcDagitimHatasi(sorgulananBorcBilgi);
                            throw new ValidationException(sorgulananBorcBilgi.getVKnTckN() + " nolu TCKN/VKN için ödenecek GİB borcu: " + odenecekGibBorcuForProvizyonList + " GİB'den dönen toplam borç: " + sorgulananBorcBilgi.getToplamGibBorcu());
                        }
                        sorgulananBorcBilgi.setOdenecekGibBorcu(odenecekGibBorcuForProvizyonList);
                        // Aşağıdaki borç bilgisi kaydet ekstra teste muhtaç
                        try {
                            borcBilgisiKaydet(mahsupDisiProvizyonList, odenecekSgkBorcuForProvizyonList, odenecekGibBorcuForProvizyonList, sorgulananBorcBilgi);
                        } catch (Exception e) {
                            throw new RuntimeException(e.getMessage());
                        }
                        sorgulananBorcBilgi.setBorclarHakediseGoreDagitildi(true);
                        sorgulananBorcBilgiService.kaydet(sorgulananBorcBilgi);
                    }
                }
            } catch (Exception e) {
                logger.error("BorcIslemleriServiceImpl",sorgulananBorcBilgi.getId() + " id'li sbb icin borc dagitimda hata mesaji: " + e.getMessage());
                logger.error("BorcIslemleriServiceImpl",sorgulananBorcBilgi.getId() + " id'li sbb icin borc dagitimda hata: " + e);
            }
        }
    }

    private boolean isMahsupTahakkukuVar(List<SorgulananBorcBilgiTahakkuk> sorgulananBorcBilgiTahakkukList) throws Exception {
        for (SorgulananBorcBilgiTahakkuk sorgulananBorcBilgiTahakkuk : sorgulananBorcBilgiTahakkukList) {
            Long tahakkukId = sorgulananBorcBilgiTahakkuk.getTahakkukId();
            Tahakkuk tahakkuk = tahakkukIslemleriService.getTahakkuk(tahakkukId);
            KararDTO kararDTO = kararIslemleriService.getKararByKararNo(tahakkuk.getKararNo());
            if(kararDTO.isMahsupKarar()){
                return true;
            }
        }
        return false;
    }

    private void handleBorcDagitimHatasi(SorgulananBorcBilgi sorgulananBilgi) {
        String kayit = getTahakkukBilgileri(sorgulananBilgi);
        String tcknVkn = StringUtils.isNotBlank(sorgulananBilgi.getVkn()) ? sorgulananBilgi.getVkn() : sorgulananBilgi.getTckn();
        kayit += StringUtils.isNotBlank(sorgulananBilgi.getVkn()) ? "VKN: " : "TCKN: ";
        kayit += tcknVkn;
        kayit += ", GİB Sorgu ID: " + sorgulananBilgi.getGibDosyaId() + ", SGK Sorgu ID:" + sorgulananBilgi.getSgkDosyaId();

        String subject = "OGMDFİF BORÇ DAGITIM SONUCU HATASI";
        String body = "İlgili kaydın borç dağıtım sonucu başarısız olmuştur. Başarısız olan kayıt: \n" + kayit;

        try {
            mailService.sendMail(EmirIslemleriServiceImpl.OGM_BIRIM_MAIL, EmirIslemleriServiceImpl.TO_LIST_ALL, null, subject, body);
        } catch (Exception ex) {
            logger.error("BorcIslemleriServiceImpl","handleSgkBorcSorgulamaSonucHatasi bilgilendirme maili atilamadi. Hata: {}", ex.toString());
        }
    }

    private List<Long> filterOdenebilirDurumdakiTahakkukList(Long tahakkukId) {
        List<Long> odenebilirTahakkukIdList = new ArrayList<>();
        boolean isOdenebilir = true;
        List<Tahakkuk> iliskiliTahakkukList = new ArrayList<>();
        Tahakkuk currentTahakkuk = tahakkukIslemleriService.getTahakkuk(tahakkukId);
        TahakkukPaketiDosyasi tahakkukPaketiDosyasi = currentTahakkuk.getTahakkukPaketiDosyasi();
        if (tahakkukPaketiDosyasi == null) {
            iliskiliTahakkukList.add(currentTahakkuk);
        } else {
            iliskiliTahakkukList = tahakkukPaketiDosyasi.getTahakkukList();
        }

        Set<SorgulananBorcBilgiTahakkuk> sorgulananBorcBilgiTahakkukSet = new HashSet<>();
        for (Tahakkuk tahakkuk : iliskiliTahakkukList) {
            Long currentTahakkukId = tahakkuk.getId();
            List<SorgulananBorcBilgiTahakkuk> currentSorgulananBorcBilgiTahakkukList =
                    sorgulananBorcBilgiTahakkukService.getSorgulananBorcBilgiTahakkukListByTahakkukId(String.valueOf(currentTahakkukId));
            sorgulananBorcBilgiTahakkukSet.addAll(currentSorgulananBorcBilgiTahakkukList);
        }

        if (sorgulananBorcBilgiTahakkukSet == null || sorgulananBorcBilgiTahakkukSet.isEmpty()) {
            logger.error("BorcIslemleriServiceImpl","filterOdenebilirDurumdakiTahakkukList tahakkukId: " + tahakkukId);
        } else {
            for (SorgulananBorcBilgiTahakkuk sbbt : sorgulananBorcBilgiTahakkukSet) {
                SorgulananBorcBilgi sorgulananBorcBilgi = sorgulananBorcBilgiService.getSorgulananBorcBilgi(sbbt.getSorgulananBorcBilgiId());
                if (sorgulananBorcBilgi != null && (sorgulananBorcBilgi.getSorguDurum().equals(SorgulananBorcDurumEnum.SORGU_DOSYA_ID_BEKLIYOR.getKod())
                        || sorgulananBorcBilgi.getSorguDurum().equals(SorgulananBorcDurumEnum.SORGU_SONUCU_BEKLIYOR.getKod()))) {
                    isOdenebilir = false;
                    break;
                }
            }
        }
        logger.info("BorcIslemleriServiceImpl","filterOdenebilirDurumdakiTahakkukList tahakkukId: " + tahakkukId + " isOdenebilir: " + isOdenebilir);
        if (isOdenebilir) {
            odenebilirTahakkukIdList.add(tahakkukId);
        }
        return odenebilirTahakkukIdList;
    }

    @Override
    public void bugunkuTahakkuklariBul() {
        Date bugun = new Date();
        List<SorgulananBorcBilgi> sorgulananBorcBilgiList = sorgulananBorcBilgiService.getSorgulananBorcBilgiList(bugun);
        for (SorgulananBorcBilgi sorgulananBorcBilgi : sorgulananBorcBilgiList) {
            List<SorgulananBorcBilgiTahakkuk> sorgulananBorcBilgiTahakkukList = sorgulananBorcBilgiTahakkukService.getSorgulananBorcBilgiTahakkukList(sorgulananBorcBilgi.getId());
            if(sorgulananBorcBilgiTahakkukList != null) {
                for (SorgulananBorcBilgiTahakkuk sorgulananBorcBilgiTahakkuk : sorgulananBorcBilgiTahakkukList) {
                    bugunkuTumTahakkukIdSet.add(sorgulananBorcBilgiTahakkuk.getTahakkukId());
                }
            }
        }
        logger.info("BorcIslemleriServiceImpl","bugunkuTahakkuklariBul bugunkuTumTahakkukIdSet: " + bugunkuTumTahakkukIdSet);
    }

    @Override
    public void odenebilirlikKontroluYap() {
        int setSizeLimit = 75;
        if(bugunkuTumTahakkukIdSet.size() != (kontrolEdilmisOdenebilirTahakkukIdSet.size() + kontrolEdilmisOdenemezTahakkukIdSet.size())) {
            Set<Long> kontrolEdilmemisTahakkukIdSet = new HashSet<>();
            for(Long tahakkukId : bugunkuTumTahakkukIdSet) {
                if (!kontrolEdilmisOdenebilirTahakkukIdSet.contains(tahakkukId) && !kontrolEdilmisOdenemezTahakkukIdSet.contains(tahakkukId)) {
                    if(kontrolEdilmemisTahakkukIdSet.size() < setSizeLimit) {
                        kontrolEdilmemisTahakkukIdSet.add(tahakkukId);
                    }

                    if(setSizeLimit == kontrolEdilmemisTahakkukIdSet.size()) {
                        break;
                    }
                }
            }

            logger.info("BorcIslemleriServiceImpl", "kontrolEdilmemisTahakkukIdSet: " + kontrolEdilmemisTahakkukIdSet);
            for (Long tahakkukId : kontrolEdilmemisTahakkukIdSet) {
                List<SorgulananBorcBilgi> buPaketleIliskiliSbbList = sorgulananBorcBilgiService.getPaketleIliskiliTumTahakkuklarinSbbleri(tahakkukId);
                if (!paketteIstemedigimizDurumlarVarMi(buPaketleIliskiliSbbList)) {
                    kontrolEdilmisOdenebilirTahakkukIdSet.add(tahakkukId);
                } else {
                    kontrolEdilmisOdenemezTahakkukIdSet.add(tahakkukId);
                }
            }
        }

        logger.info("BorcIslemleriServiceImpl","kontrolEdilmisOdenebilirTahakkukIdSet: " + kontrolEdilmisOdenebilirTahakkukIdSet);
        logger.info("BorcIslemleriServiceImpl","kontrolEdilmisOdenemezTahakkukIdSet: " + kontrolEdilmisOdenemezTahakkukIdSet);
        logger.info("BorcIslemleriServiceImpl","Toplam tahakkuk sayı: " + bugunkuTumTahakkukIdSet.size() + " , "
                + "Ödenebilir tahakkuk sayı: " + kontrolEdilmisOdenebilirTahakkukIdSet.size() + " , "
                + "Ödenemez tahakkuk sayı: " + kontrolEdilmisOdenemezTahakkukIdSet.size());
    }




    @Override
    public void odenmeyecekTahakkuklarinBorclariniTemizle() {
        for (Long tahakkukId : kontrolEdilmisOdenemezTahakkukIdSet) {
            List<ProvizyonTalep> provizyonTalepList = provizyonTalepService.getProvizyonTalepByTahakkukId(tahakkukId);
            for (ProvizyonTalep provizyonTalep : provizyonTalepList) {
                List<Provizyon> provizyonList = provizyonIslemleriService.getProvizyonListesi(Collections.singletonList(provizyonTalep.getId()));
                for (Provizyon provizyon : provizyonList) {
                    List<BorcBilgi> borcBilgiList = provizyon.getBorcBilgiList();
                    for (BorcBilgi borcBilgi : borcBilgiList) {
                        logger.info("odenmeyecekTahakkuklarinBorclariniTemizle","siliniyor: " + borcBilgi);
                        borcBilgisiService.deleteBorcBilgi(borcBilgi);
                    }
                }
            }
        }
    }

    @Override
    public void tahsilatKontroluYap() {
        Date bugun = new Date();
        List<SorgulananBorcBilgi> bugunTahsilatBekleyenSbbList = sorgulananBorcBilgiService.getSorgulananBorcBilgiListByDurum(bugun,
                SorgulananBorcDurumEnum.TAHSILAT_BEKLIYOR, 0);
        bugunTahsilatBekleyenSbbList = bugunTahsilatBekleyenSbbList.stream().filter((SorgulananBorcBilgi sorgulananBorcBilgi) ->
            sorgulananBorcBilgi.getTahsilatTarihi() == null && StringUtils.isBlank(sorgulananBorcBilgi.getTahsilatId())).limit(100)
                .collect(Collectors.toList());

        for (SorgulananBorcBilgi sorgulananBorcBilgi : bugunTahsilatBekleyenSbbList) {
            Set<Long> buKayitlaIlgiliOkayTahakkuklar = new HashSet<>(); // bunlarla alakali tahsilat yapacağım

            List<SorgulananBorcBilgiTahakkuk> sorgulananBorcBilgiTahakkukList = sorgulananBorcBilgiTahakkukService.
                    getSorgulananBorcBilgiTahakkukList(sorgulananBorcBilgi.getId());
            // Bu sbb ile ilişkili sbbtleri çektik, burdan ilişkili tahakkukları kontrol etmeliyiz.
            for (SorgulananBorcBilgiTahakkuk sorgulananBorcBilgiTahakkuk : sorgulananBorcBilgiTahakkukList) {
                Long tahakkukId = sorgulananBorcBilgiTahakkuk.getTahakkukId();
                if (kontrolEdilmisOdenebilirTahakkukIdSet.contains(tahakkukId)) {
                    buKayitlaIlgiliOkayTahakkuklar.add(tahakkukId);
                } else if (!kontrolEdilmisOdenemezTahakkukIdSet.contains(tahakkukId)) {
                    // bu tahakkuk iki sette de yoksa, yani henüz kontrol edilmediyse
                    List<SorgulananBorcBilgi> buPaketleIliskiliSbbList = sorgulananBorcBilgiService.getPaketleIliskiliTumTahakkuklarinSbbleri(tahakkukId);
                    // bu tahakkukla ilişkili sbbleri çektik, durumlarına bakacağız.
                    if (!paketteIstemedigimizDurumlarVarMi(buPaketleIliskiliSbbList)) {
                        // paketteIstemedigimizDurumlar yok ise
                        buKayitlaIlgiliOkayTahakkuklar.add(tahakkukId);
                        kontrolEdilmisOdenebilirTahakkukIdSet.add(tahakkukId);
                    } else {
                        kontrolEdilmisOdenemezTahakkukIdSet.add(tahakkukId);
                    }
                }
            }

            // bu kaydı sgk - gib tahsilatına kadar götüreceğim buradan.
            // BU KAYITLA ALAKALI TAHAKKUK->PROVİZYON TALEP->PROVİZYON->BORÇ BİLGİ erişimlerini sağlamalıyız.
            // Ödenebilir tahakkukla ilişkili borç bilgilerin tahsilatı yapılmalı.
            // Ödenemez durumdakilerle ilişkili olan borç bilgiler silinmeli ve tahsilata KESİNLİKLE gitmemeli.

            if (buKayitlaIlgiliOkayTahakkuklar.isEmpty()) {
                logger.error("BorcIslemleriServiceImpl","sbbId: " + sorgulananBorcBilgi.getId() + " buKayitlaIlgiliOkayTahakkuklar is empty!");
                continue;
            }

            // ------------ ÖDENEBİLECEKLERİN İŞİ BAŞLADI.
            List<Provizyon> odenebilirTahakkuklarinProvizyonlari = provizyonIslemleriService.getProvizyonList(new ArrayList<>(buKayitlaIlgiliOkayTahakkuklar));
            // Buradaki provizyonların ihracatçısı şu anki sbb ile aynı olmalı.
            String vknTckn = sorgulananBorcBilgi.getVKnTckN();

            List<Provizyon> iliskiliProvizyonlar = new ArrayList<>();
            for (Provizyon provizyon : odenebilirTahakkuklarinProvizyonlari) {
                if (provizyon.getIhracatci().getTcknVknAsString().equals(vknTckn)) {
                    iliskiliProvizyonlar.add(provizyon);
                }
            }

            BigDecimal toplamSgkBorcBilgiTutarForOkayTahakkuklar = BigDecimal.ZERO;
            BigDecimal toplamGibBorcBilgiTutarForOkayTahakkuklar = BigDecimal.ZERO;
            List<BorcBilgi> iliskiliBorcBilgiler = borcBilgisiService.getBorcBilgiByProvizyonList(iliskiliProvizyonlar);
            for (BorcBilgi borcBilgi : iliskiliBorcBilgiler) {
                if (borcBilgi.getOdemeMuhasebeIstekId() == null && borcBilgi.getBorcTipi().equals(BorcTipEnum.SGK.getKod())) {
                    toplamSgkBorcBilgiTutarForOkayTahakkuklar = toplamSgkBorcBilgiTutarForOkayTahakkuklar.add(borcBilgi.getTutar());
                } else if (borcBilgi.getOdemeMuhasebeIstekId() == null && borcBilgi.getBorcTipi().equals(BorcTipEnum.GIB.getKod())) {
                    toplamGibBorcBilgiTutarForOkayTahakkuklar = toplamGibBorcBilgiTutarForOkayTahakkuklar.add(borcBilgi.getTutar());
                }
            }

            sorgulananBorcBilgi.setOdenecekSgkBorcu(toplamSgkBorcBilgiTutarForOkayTahakkuklar);
            sorgulananBorcBilgi.setOdenecekGibBorcu(toplamGibBorcBilgiTutarForOkayTahakkuklar);

            gibBorcTahsilatiGerceklestir(sorgulananBorcBilgi); // GİB TAHSİLATINI YAP.
            toplamGibTahsilatTutarim = toplamGibTahsilatTutarim.add(toplamGibBorcBilgiTutarForOkayTahakkuklar);

            df.setGroupingSize(3); // Binlik ayracı için 3 basamak
            logger.info("BorcIslemleriServiceImpl","tahsilatKontroluYap-> toplamGibTahsilatTutarim: " + df.format(toplamGibTahsilatTutarim));

            sorgulananBorcBilgi.setSorguDurum(SorgulananBorcDurumEnum.KONTROL_TAMAM.getKod());
            sorgulananBorcBilgiService.kaydet(sorgulananBorcBilgi);
        }
    }

    @Override
    public void sgkTahsilatYap() {
        Date bugun = new Date();
        List<SorgulananBorcBilgi> bugunTahsilEdilecekSbbList = sorgulananBorcBilgiService.getSorgulananBorcBilgiListByDurum(bugun,
                SorgulananBorcDurumEnum.KONTROL_TAMAM, 0);
        bugunTahsilEdilecekSbbList = bugunTahsilEdilecekSbbList.stream().filter((SorgulananBorcBilgi sorgulananBorcBilgi) ->
                        sorgulananBorcBilgi.getTahsilatTarihi() == null && StringUtils.isBlank(sorgulananBorcBilgi.getTahsilatId())).limit(75)
                .collect(Collectors.toList());

        for(SorgulananBorcBilgi sorgulananBorcBilgi : bugunTahsilEdilecekSbbList) {
            String vknTckn = sorgulananBorcBilgi.getVKnTckN();

            // Burada, SGK'ya tahsilat için gitmeden önce anlık (şube) tarafındaki kayıtları da kontrol etmeliyiz.
            List<AnlikBorc> tahsilatBekleyenAnlikBorcList = anlikBorcService.getTahsilatBekleyenAnlikBorcList();
            List<AnlikBorc> iliskiliAnlikBorclar = new ArrayList<>();
            BigDecimal anlikBorctanBeklenilenTahsilatTutariForBuIhracatci = BigDecimal.ZERO;

            for (AnlikBorc anlikBorc : tahsilatBekleyenAnlikBorcList) {
                if (anlikBorc.getBorcTip().equals(BorcTipEnum.SGK.getKod()) && anlikBorc.getTahsilatId() == null
                        && anlikBorc.getIhracatci().getTcknVknAsString().equals(vknTckn)) {
                    anlikBorctanBeklenilenTahsilatTutariForBuIhracatci = anlikBorctanBeklenilenTahsilatTutariForBuIhracatci.add(anlikBorc.getOdenecekTutar());
                    iliskiliAnlikBorclar.add(anlikBorc);
                }
            }

            SgkBorcTahsilat sgkBorcTahsilat = new SgkBorcTahsilat();
            sgkBorcTahsilat.setSgkBorcId(sorgulananBorcBilgi.getSgkDosyaId());
            sgkBorcTahsilat.setAnlikBorcs(iliskiliAnlikBorclar);
            sgkBorcTahsilat.setSorgulananBorcBilgiId(sorgulananBorcBilgi.getId());
            sgkBorcTahsilat.setVkn(sorgulananBorcBilgi.getVkn());
            sgkBorcTahsilat.setTckn(sorgulananBorcBilgi.getTckn());
            BigDecimal olmasiGerekenSgkTahsilatTutari = anlikBorctanBeklenilenTahsilatTutariForBuIhracatci.add(sorgulananBorcBilgi.getOdenecekSgkBorcu());
            sgkBorcTahsilat.setOdenecekTutar(olmasiGerekenSgkTahsilatTutari);
            TahsilatSonuc tahsilatSonuc = sgkBorcTahsilatiniGerceklestir(sgkBorcTahsilat);
            logger.info("sgkTahsilatYap","sgkBorcTahsilatiniGerceklestir bitti. tahsilatSonuc: " + tahsilatSonuc);

            if (tahsilatSonuc.isBasarili()) {
                for (AnlikBorc anlikBorc : iliskiliAnlikBorclar) {
                    anlikBorc.setTahsilatId(tahsilatSonuc.getTahsilatId());
                    anlikBorc.setTahsilatTarihi(bugun);
                    anlikBorc.setIslemDurum(AnlikBorcDurumEnum.MUTABAKAT_BEKLIYOR.getKod());
                    anlikBorcService.kaydet(anlikBorc);
                }

                sorgulananBorcBilgi.setTahsilatId(tahsilatSonuc.getTahsilatId());
                if (tahsilatSonuc.getTahsilatId().equals("-")) {
                    // Toplam SGK borcu: 0,03 (3 kuruş)
                    // Ödenecek SGK borcu: 0 senaryosu için bug fix, sbb durumu 5'te kalmıştı.
                    sorgulananBorcBilgi.setSgkMutabakatSaglandi(true);
                }
                sorgulananBorcBilgi.setTahsilatTarihi(bugun);
                sorgulananBorcBilgiService.kaydet(sorgulananBorcBilgi);

                toplamSgkTahsilatTutarim = toplamSgkTahsilatTutarim.add(olmasiGerekenSgkTahsilatTutari);
            }

            df.setGroupingSize(3); // Binlik ayracı için 3 basamak
            logger.info("sgkTahsilatYap","sgkTahsilatYap-> toplamSgkTahsilatTutarim: " + df.format(toplamSgkTahsilatTutarim));
        }

        // Buradan itibaren sbbden bağımsız (tekil) anlık borçların tahsilatını gerçekleştireceğim.
        Map<String, List<AnlikBorc>> ihracatciTcknVknToAnlikBorcs = new HashMap<>();

        List<AnlikBorc> tahsilatBekleyenAnlikBorcList = anlikBorcService.getTahsilatBekleyenAnlikBorcList();
        for (AnlikBorc anlikBorc : tahsilatBekleyenAnlikBorcList) {
            boolean buIhracatcininAnlikBorcTahsilatiYapilmaliMi = false;
            String ihracatciTcknVkn = anlikBorc.getIhracatci().getTcknVknAsString();
            SorgulananBorcBilgi sorgulananBorcBilgi = sorgulananBorcBilgiService.getSorgulananBorcBilgiBySorguTarihi(bugun, ihracatciTcknVkn);
            if (sorgulananBorcBilgi != null) {
                String durum = sorgulananBorcBilgi.getSorguDurum();
                if (durum.equals(SorgulananBorcDurumEnum.SORGU_DOSYA_ID_BEKLIYOR.getKod()) ||
                        durum.equals(SorgulananBorcDurumEnum.SORGU_SONUCU_BEKLIYOR.getKod()) ||
                        durum.equals(SorgulananBorcDurumEnum.BORC_DAGITIMI_BEKLIYOR.getKod()) ||
                        durum.equals(SorgulananBorcDurumEnum.TAHSILAT_BEKLIYOR.getKod())) {
                    // statei yukarıdaki 4 taneden biriyse, sbb ile bağlantılı tahsilat kaydedilmeyecek demektir.
                    buIhracatcininAnlikBorcTahsilatiYapilmaliMi = true;
                }
            } else {
                buIhracatcininAnlikBorcTahsilatiYapilmaliMi = true;
            }

            if (buIhracatcininAnlikBorcTahsilatiYapilmaliMi) {
                List<AnlikBorc> anlikBorcList = ihracatciTcknVknToAnlikBorcs.get(ihracatciTcknVkn);
                if (anlikBorcList == null) {
                    // Bu ihracatçının birden fazla anlık borç talebi olabilir, hepsi için toplam 1 adet sgk tahsilatı kaydedilmeli.
                    List<AnlikBorc> anlikBorcsForTahsilat = getAyniIhracatcininAnlikBorclari(tahsilatBekleyenAnlikBorcList, ihracatciTcknVkn);
                    ihracatciTcknVknToAnlikBorcs.put(ihracatciTcknVkn, anlikBorcsForTahsilat);
                    BigDecimal toplamTahsilatTutari = BigDecimal.ZERO;
                    for (AnlikBorc anlikBorcForTahsilat : anlikBorcsForTahsilat) {
                        toplamTahsilatTutari = toplamTahsilatTutari.add(anlikBorcForTahsilat.getOdenecekTutar());
                    }

                    SgkBorcTahsilat sgkBorcTahsilat = new SgkBorcTahsilat();
                    sgkBorcTahsilat.setSgkBorcId(anlikBorcsForTahsilat.get(0).getSorguId());
                    sgkBorcTahsilat.setAnlikBorcs(anlikBorcsForTahsilat);
                    sgkBorcTahsilat.setSorgulananBorcBilgiId(null);
                    sgkBorcTahsilat.setVkn(anlikBorcsForTahsilat.get(0).getIhracatci().getVkn());
                    sgkBorcTahsilat.setTckn(anlikBorcsForTahsilat.get(0).getIhracatci().getTckn());
                    sgkBorcTahsilat.setOdenecekTutar(toplamTahsilatTutari);
                    TahsilatSonuc tahsilatSonuc = sgkBorcTahsilatiniGerceklestir(sgkBorcTahsilat);
                    logger.info("sgkTahsilatYap", "Anlik borc sgkBorcTahsilatiniGerceklestir bitti. tahsilatSonuc: " + tahsilatSonuc);

                    if (tahsilatSonuc.isBasarili()) {
                        for (AnlikBorc anlikBorcForTahsilat : anlikBorcsForTahsilat) {
                            anlikBorcForTahsilat.setTahsilatId(tahsilatSonuc.getTahsilatId());
                            anlikBorcForTahsilat.setTahsilatTarihi(bugun);
                            anlikBorcForTahsilat.setIslemDurum(AnlikBorcDurumEnum.MUTABAKAT_BEKLIYOR.getKod());
                            anlikBorcService.kaydet(anlikBorcForTahsilat);
                        }
                        // Bu tahsilatın sbb bağı yok!

                        toplamSgkTahsilatTutarim = toplamSgkTahsilatTutarim.add(toplamTahsilatTutari);
                    }

                    df.setGroupingSize(3); // Binlik ayracı için 3 basamak
                    logger.info("sgkTahsilatYap", "Anlik sgkTahsilatYap-> toplamSgkTahsilatTutarim: " + df.format(toplamSgkTahsilatTutarim));
                }
            }
        }
    }

    // Bu fonksiyon state bağımsız çalışır.
    private List<AnlikBorc> getAyniIhracatcininAnlikBorclari(List<AnlikBorc> anlikBorcList, String ihracatciTcknVkn) {
        List<AnlikBorc> anlikBorcs = new ArrayList<>();

        for (AnlikBorc anlikBorc : anlikBorcList) {
            if (anlikBorc.getIhracatci().getTcknVknAsString().equals(ihracatciTcknVkn)) {
                anlikBorcs.add(anlikBorc);
            }
        }

        return anlikBorcs;
    }

    class TahsilatSonuc {
        private BigDecimal tahsilatTutar = BigDecimal.ZERO;
        private String tahsilatId = null;
        private boolean basarili = false;

        public BigDecimal getTahsilatTutar() {
            return tahsilatTutar;
        }

        public void setTahsilatTutar(BigDecimal tahsilatTutar) {
            this.tahsilatTutar = tahsilatTutar;
        }

        public String getTahsilatId() {
            return tahsilatId;
        }

        public void setTahsilatId(String tahsilatId) {
            this.tahsilatId = tahsilatId;
        }

        public boolean isBasarili() {
            return basarili;
        }

        public void setBasarili(boolean basarili) {
            this.basarili = basarili;
        }
    }

    private TahsilatSonuc sgkBorcTahsilatiniGerceklestir(SgkBorcTahsilat sgkBorcTahsilat) {
        TahsilatSonuc tahsilatSonuc = new TahsilatSonuc();

        logger.info("BorcIslemleriServiceImpl","sgkBorcTahsilatiniGerceklestir calisti. sgkBorcTahsilat: " + sgkBorcTahsilat);
        // Not: Sgk'da bir borcId/talepId'ye birden fazla tahsilat kaydedilemiyor!
        BigDecimal odenecekTutar = sgkBorcTahsilat.getOdenecekTutar();

        try {
            if (odenecekTutar.compareTo(BigDecimal.ZERO) > 0) {
                SgkResponse<SgkTahsilatKaydetResult>
                        sgkResponse = sgkClientService.tahsilatKaydet(Long.valueOf(sgkBorcTahsilat.getSgkBorcId()), odenecekTutar);
                logger.info("BorcIslemleriServiceImpl",(sgkResponse != null) ? sgkResponse.toString() : "sgkResponse is NULL!");
                if (sgkResponse != null && sgkResponse.getReturnCode() != null && (sgkResponse.getReturnCode() == 201 || sgkResponse.getReturnCode() == 102)) {
                    // tahsilat başarıyla kaydedildi
                    tahsilatSonuc.setTahsilatTutar(sgkResponse.getData().getTahsilatTutari());
                    tahsilatSonuc.setTahsilatId(String.valueOf(sgkResponse.getData().getTahsilatId()));
                    tahsilatSonuc.setBasarili(true);
                } else {
                    // tahsilat kaydedilemedi
                    logger.error("BorcIslemleriServiceImpl",(StringUtils.isNotBlank(sgkBorcTahsilat.getVkn()) ? sgkBorcTahsilat.getVkn() : sgkBorcTahsilat.getTckn()) +
                            " için SGK borç tahsilatı işlemi başarısız oldu. Borç/Dosya id: " + sgkBorcTahsilat.getSgkBorcId() +
                            " - Tahsil Edilmek İstenen Tutar: " + odenecekTutar.toPlainString());
                    tahsilatSonuc.setBasarili(false);
                }
            } else {
                // odenecekTutar == 0
                tahsilatSonuc.setBasarili(true);
                tahsilatSonuc.setTahsilatTutar(BigDecimal.ZERO);
                tahsilatSonuc.setTahsilatId("-"); // Setting a dummy tahsilatId, sgk borcu olmayanlar için tahsilat servisine gitmeden ilgili kolonu bu şekilde güncelliyoruz.
            }
        } catch (Exception e) {
            logger.error("BorcIslemleriServiceImpl","sgkBorcTahsilatiniGerceklestir Borc/Dosya id: " + sgkBorcTahsilat.getSgkBorcId() + ". Hata: " + e);
            tahsilatSonuc.setBasarili(false);
        }

        return tahsilatSonuc;
    }

    private void gibBorcTahsilatiGerceklestir(SorgulananBorcBilgi sorgulananBorcBilgi) {
        // GİB'e web servis ile tahsilat kaydedilmiyor, mutabakat sağlanmıyor.
        BigDecimal odenmesiGerekenGibBorcu = sorgulananBorcBilgi.getOdenecekGibBorcu();
        if (odenmesiGerekenGibBorcu.compareTo(BigDecimal.ZERO) < 0) {
            logger.error("BorcIslemleriServiceImpl","borcTahsilatiGerceklestir", "GIB borc tahsilati basarisiz! odenmesiGerekenGibBorcu 0'dan az olamaz! GIB dosya ID: "
                    + sorgulananBorcBilgi.getGibDosyaId() +
                    ", odenmesiGerekenGibBorcu: " +
                    odenmesiGerekenGibBorcu.toPlainString() + ", sorgulananBorcBilgi: " + sorgulananBorcBilgi.getId());
            // gib mutabakatı zaten false idi, false kalacak.
            return; // başarısız
        }

        // odenmesiGerekenGibBorcu >= 0 ise
        sorgulananBorcBilgi.setOdenenGibBorcu(sorgulananBorcBilgi.getOdenecekGibBorcu());
        sorgulananBorcBilgi.setGibMutabakatSaglandi(true);
        sorgulananBorcBilgi.setGuncelleyenKullaniciId(0);
    }

    // SADECE DAĞITIM KONTROL AŞAMASI İÇİN KONTROL SAĞLAR!
    public static boolean paketteIstemedigimizDurumlarVarMi(List<SorgulananBorcBilgi> sorgulananBorcBilgiList) {
        boolean paketteIstemedigimizDurumlarVar = false;
        for(SorgulananBorcBilgi sorgulananBorcBilgi : sorgulananBorcBilgiList) {
            if(sorgulananBorcBilgi.getSorguDurum().equals(SorgulananBorcDurumEnum.SORGU_DOSYA_ID_BEKLIYOR.getKod())
                    || sorgulananBorcBilgi.getSorguDurum().equals(SorgulananBorcDurumEnum.SORGU_SONUCU_BEKLIYOR.getKod())
                    || sorgulananBorcBilgi.getSorguDurum().equals(SorgulananBorcDurumEnum.BORC_DAGITIMI_BEKLIYOR.getKod())) {
                paketteIstemedigimizDurumlarVar = true;
                break;
            }
        }

        return paketteIstemedigimizDurumlarVar;
    }

    @Override
    public void uzunSurenKayitlarIcinMailAt() throws Exception {
        Date today = new Date();
        Date referansTarihi = muhasebeClientService.getOncekiSonrakiIsGunu(today, -Constants.BORC_ISLEM_SURESI);
        Date previousWorkingDay = muhasebeClientService.getOncekiSonrakiIsGunu(today, -1);
        List<SorgulananBorcBilgi> sorgulananBorcBilgiList = sorgulananBorcBilgiService.getSorguTarihiAyniOlanSbbList(previousWorkingDay);
        List<SorgulananBorcBilgi> referansTarihindenOnceAtilmisKayitlar = new ArrayList<>();
        for (SorgulananBorcBilgi sorgulananBorcBilgi : sorgulananBorcBilgiList) {
            if (sorgulananBorcBilgi.getSorguDurum().equals(SorgulananBorcDurumEnum.SORGU_DOSYA_ID_BEKLIYOR.getKod()) ||
                    sorgulananBorcBilgi.getSorguDurum().equals(SorgulananBorcDurumEnum.SORGU_SONUCU_BEKLIYOR.getKod())
                    || sorgulananBorcBilgi.getSorguDurum().equals(SorgulananBorcDurumEnum.BORC_DAGITIMI_BEKLIYOR.getKod()) ||
                    sorgulananBorcBilgi.getSorguDurum().equals(SorgulananBorcDurumEnum.TAHSILAT_BEKLIYOR.getKod())) {
                if (sorgulananBorcBilgi.getKaydinIlkAtildigiTarih().compareTo(referansTarihi) <= 0) {
                    // 2 iş günü geçtiyse bildirmek amaçlı
                    referansTarihindenOnceAtilmisKayitlar.add(sorgulananBorcBilgi);
                }
            }
        }
        if(!referansTarihindenOnceAtilmisKayitlar.isEmpty()) {
            uzunSurenBorcSorgulariIcinMailAt(referansTarihindenOnceAtilmisKayitlar);
        }
    }

    private void uzunSurenBorcSorgulariIcinMailAt(List<SorgulananBorcBilgi> sorgulananBorcBilgiList) {
        logger.info("BorcIslemleriServiceImpl","uzunSurenBorcSorgulariIcinMailAt calisti.");
        StringBuilder hataliKayitlar = new StringBuilder();
        SimpleDateFormat sdf = new SimpleDateFormat("dd/MM/yyyy");
        for (SorgulananBorcBilgi sorgulananBorcBilgi : sorgulananBorcBilgiList) {
            hataliKayitlar
                    .append("\n")
                    .append(StringUtils.isNotBlank(sorgulananBorcBilgi.getVkn()) ? "VKN: " + sorgulananBorcBilgi.getVkn()
                            : "TCKN: " + sorgulananBorcBilgi.getTckn())
                    .append(", Kaydın atıldığı tarih: ").append(sdf.format(sorgulananBorcBilgi.getKaydinIlkAtildigiTarih()));
            List<SorgulananBorcBilgiTahakkuk> sorgulananBorcBilgiTahakkukList = sorgulananBorcBilgiTahakkukService.getSorgulananBorcBilgiTahakkukList(sorgulananBorcBilgi.getId());
            for(SorgulananBorcBilgiTahakkuk sorgulananBorcBilgiTahakkuk : sorgulananBorcBilgiTahakkukList) {
                Tahakkuk tahakkuk = tahakkukIslemleriService.getTahakkuk(sorgulananBorcBilgiTahakkuk.getTahakkukId());
                hataliKayitlar
                        .append(" - Tür: ").append(KararTipiEnum.getBykod(tahakkuk.getTur()))
                        .append(", Yıl: ").append(tahakkuk.getYil())
                        .append(", Belge numarası: ").append(tahakkuk.getBelgeNo());
            }
        }
        String subject = "OGMDFİF BORÇ SORGUSU BAŞARISIZ OLAN KAYITLAR";
        String body = "Aşağıdaki kayıtların borç sorgu süreçleri 2 iş günü içerisinde başarıyla tamamlanamamıştır! Bilginize...\nBaşarısız olan kayıtlar:" +
                hataliKayitlar;
        try {
            mailService.sendMail(EmirIslemleriServiceImpl.OGM_BIRIM_MAIL, EmirIslemleriServiceImpl.TO_LIST_ALL, null, subject, body);
            logger.info("BorcIslemleriServiceImpl","uzunSurenBorcSorgulariIcinMailAt mail basariyla gonderildi.");
        } catch (Exception ex) {
            logger.error("BorcIslemleriServiceImpl","uzunSurenBorcSorgulariIcinMailAt bilgilendirme maili atilamadi. Hata: {}", ex.toString());
        }
    }

    @Override
    public void sorgulananBorcYeniGunleAlakaliIslemleriYap() throws Exception {
        Date today = new Date();

        // İş günü olmayan hafta içi günlerde borç sorgusu yapılmamalıdır.
        Boolean bugunIsGunuMu = muhasebeClientService.getIsGunuMu(today);
        if (bugunIsGunuMu != null) {
            logger.info("BorcIslemleriServiceImpl","bugunIsGunuMu: " + bugunIsGunuMu);
        }
        
        if(bugunIsGunuMu != null && bugunIsGunuMu) {
            Date previousWorkingDay = muhasebeClientService.getOncekiSonrakiIsGunu(today, -1);
            List<String> sorgulananBorcDurumEnumList = new ArrayList<>();
            sorgulananBorcDurumEnumList.add(SorgulananBorcDurumEnum.SORGU_DOSYA_ID_BEKLIYOR.getKod());
            sorgulananBorcDurumEnumList.add(SorgulananBorcDurumEnum.SORGU_SONUCU_BEKLIYOR.getKod());
            sorgulananBorcDurumEnumList.add(SorgulananBorcDurumEnum.BORC_DAGITIMI_BEKLIYOR.getKod());
            sorgulananBorcDurumEnumList.add(SorgulananBorcDurumEnum.TAHSILAT_BEKLIYOR.getKod());
            List<SorgulananBorcBilgi> sorgulananBorcBilgiList = sorgulananBorcBilgiService.getSorguTarihiAyniOlanSbbList(previousWorkingDay, sorgulananBorcDurumEnumList);
            Set<Long> tahakkukIdSet = sorgulananBorcBilgiTahakkukService.getUniqueTahakkukList(sorgulananBorcBilgiList);
            List<Long> tahakkukIdList = new ArrayList<>(tahakkukIdSet);
            Collections.shuffle(tahakkukIdList);
            Map<Long, List<SorgulananBorcBilgi>> yenilecekTahakkukIdMap = getYenilecekTahakkukIdList(tahakkukIdList);
            for (Long tahakkukId : yenilecekTahakkukIdMap.keySet()) {
                Map<String, SorgulananBorcBilgi> sorgulananBorcBilgiMap = new HashMap<>();
                List<SorgulananBorcBilgi> tahakkuklaIliskiliSbbList = yenilecekTahakkukIdMap.get(tahakkukId);
                for (SorgulananBorcBilgi sorgulananBorcBilgi : tahakkuklaIliskiliSbbList) {
                    if (!sorgulananBorcBilgiMap.containsKey(sorgulananBorcBilgi.getVKnTckN())){
                        sorgulananBorcBilgiMap.put(sorgulananBorcBilgi.getVKnTckN(), sorgulananBorcBilgi);
                    }
                }
                List<TahakkukDetay> tahakkukDetayList = tahakkukIslemleriService.getTahakkukDetayList(tahakkukId);
                for (TahakkukDetay tahakkukDetay : tahakkukDetayList) {
                    if (tahakkukDetay.getIhracatci().isHacizliYadaIflasli()) {
                        continue;
                    }
                    SorgulananBorcBilgi eskiSorgulananBorcBilgi = sorgulananBorcBilgiMap.get(tahakkukDetay.getIhracatci().getTcknVknAsString());
                    SorgulananBorcBilgi bugunOlusturulanBorcBilgi = sorgulananBorcBilgiService.getSorgulananBorcBilgi(today, tahakkukDetay.getIhracatci().getTcknVknAsString());
                    if (bugunOlusturulanBorcBilgi == null) {
                        if(eskiSorgulananBorcBilgi != null) {
                            bugunOlusturulanBorcBilgi = sbbKaydiYenile(eskiSorgulananBorcBilgi);
                        }else{
                            bugunOlusturulanBorcBilgi = borcSorgusuOlustur(tahakkukDetay.getIhracatci().getVkn(), tahakkukDetay.getIhracatci().getTckn());
                        }
                    }
                    if(eskiSorgulananBorcBilgi != null) {
                        eskiSorgulananBorcBilgiIleTahakkukunBaginiKir(tahakkukId, eskiSorgulananBorcBilgi);
                    }
                    yeniSorgulananBorcBilgiIleTahakkukunBaginiKur(tahakkukId, bugunOlusturulanBorcBilgi);
                }
            }
        }
    }

    private Map<Long, List<SorgulananBorcBilgi>> getYenilecekTahakkukIdList(List<Long> tahakkukIdList) {
        Map<Long, List<SorgulananBorcBilgi>> yenilenecekTahakkukIdMap = new HashMap<>();
        int counter = 0;
        for (Long tahakkukId : tahakkukIdList) {
            if (counter >= 10) {
                break;
            }
            counter++;
            List<SorgulananBorcBilgi> tahakkuklaIliskiliSbbList = sorgulananBorcBilgiService.getSorgulananBorcBilgiByTahakkukId(tahakkukId);
            yenilenecekTahakkukIdMap.put(tahakkukId, tahakkuklaIliskiliSbbList);
        }
        return yenilenecekTahakkukIdMap;
    }

    private void yeniSorgulananBorcBilgiIleTahakkukunBaginiKur(Long tahakkukId, SorgulananBorcBilgi bugunOlusturulanBorcBilgi) {
        SorgulananBorcBilgiTahakkuk sorgulananBorcBilgiTahakkuk = sorgulananBorcBilgiTahakkukService.get(tahakkukId, bugunOlusturulanBorcBilgi.getId());
        if(sorgulananBorcBilgiTahakkuk != null){
            return;
        }
        sorgulananBorcBilgiTahakkuk = new SorgulananBorcBilgiTahakkuk();
        sorgulananBorcBilgiTahakkuk.setSorgulananBorcBilgiId(bugunOlusturulanBorcBilgi.getId());
        sorgulananBorcBilgiTahakkuk.setTahakkukId(tahakkukId);
        sorgulananBorcBilgiTahakkuk.setDeleted(false);
        sorgulananBorcBilgiTahakkukService.kaydet(sorgulananBorcBilgiTahakkuk);
    }

    private void eskiSorgulananBorcBilgiIleTahakkukunBaginiKir(Long tahakkukId, SorgulananBorcBilgi eskiSorgulananBorcBilgi) throws Exception {
        List<SorgulananBorcBilgiTahakkuk> sorgulananBorcBilgiTahakkukList = sorgulananBorcBilgiTahakkukService.getSorgulananBorcBilgiTahakkukList(eskiSorgulananBorcBilgi.getId());
        if(sorgulananBorcBilgiTahakkukList.size() == 1){
            SorgulananBorcBilgiTahakkuk sorgulananBorcBilgiTahakkuk =  sorgulananBorcBilgiTahakkukList.get(0);
            if(sorgulananBorcBilgiTahakkuk.getTahakkukId().longValue() == tahakkukId.longValue()){
                sorgulananBorcBilgiService.sil(eskiSorgulananBorcBilgi);
                logger.info("BorcIslemleriServiceImpl",eskiSorgulananBorcBilgi.getId() + " id'sine sahip sorgulanan Borç Bilgi nesnesi silindi");
            }
        }

        for (SorgulananBorcBilgiTahakkuk sorgulananBorcBilgiTahakkuk : sorgulananBorcBilgiTahakkukList) {
            if(sorgulananBorcBilgiTahakkuk.getTahakkukId().longValue() == tahakkukId.longValue()){
                sorgulananBorcBilgiTahakkukService.sil(sorgulananBorcBilgiTahakkuk.getId());
                logger.info("BorcIslemleriServiceImpl",sorgulananBorcBilgiTahakkuk.getId() + " id'sine sahip sorgulanan Borç Bilgi Tahakkuk nesnesi silindi");
                break;
            }
        }
    }

    private SorgulananBorcBilgi sbbKaydiYenile(SorgulananBorcBilgi sorgulananBorcBilgi) {
        Date today = new Date();
        SorgulananBorcBilgi yeniSorgulananBorcBilgi = new SorgulananBorcBilgi();
        yeniSorgulananBorcBilgi.setSgkDosyaId(null);
        if(StringUtils.isNotBlank(sorgulananBorcBilgi.getGibDosyaId()) && !sorgulananBorcBilgi.getGibDosyaId().equals("*")) {
            GibBorcSorgu ayniDosyaIdliEnEskiBorcSorgu = gibBorcSorguService.getGibBorcSorguByDosyaId(sorgulananBorcBilgi.getGibDosyaId());
            if(ayniDosyaIdliEnEskiBorcSorgu != null) {
                LocalDate bugun = today.toInstant().atZone(java.time.ZoneId.systemDefault()).toLocalDate();
                LocalDate ilkAyniGibDosyaIdliSorguTarihi = ayniDosyaIdliEnEskiBorcSorgu.getSorguTarihi().toInstant().atZone(java.time.ZoneId.systemDefault()).toLocalDate();
                long fark = Math.abs(ChronoUnit.DAYS.between(bugun, ilkAyniGibDosyaIdliSorguTarihi));
                logger.info("BorcIslemleriServiceImpl",ayniDosyaIdliEnEskiBorcSorgu.getGibDosyaId() + " GibDosyaIdsi ile atılmış ilk kaydın tarihi " + ilkAyniGibDosyaIdliSorguTarihi
                        + " ve bugün " + bugun + " ile arasındaki gün farkı: " + fark);
                if(fark < 15) {
                    GibBorcSorgu gibBorcSorguFromDb = gibBorcSorguService.getGibBorcSorgu(sorgulananBorcBilgi.getTckn(), sorgulananBorcBilgi.getVkn(), today);
                    if(gibBorcSorguFromDb == null)  {
                        GibBorcSorgu gibBorcSorgu = new GibBorcSorgu();
                        gibBorcSorgu.setYaratanKullaniciId(0);
                        gibBorcSorgu.setYaratmaZaman(LocalDateTime.now());
                        gibBorcSorgu.setGuncelleyenKullaniciId(0);
                        gibBorcSorgu.setGuncellemeZaman(LocalDateTime.now());
                        gibBorcSorgu.setSorguTarihi(today);
                        gibBorcSorgu.setVkNo(sorgulananBorcBilgi.getVkn());
                        gibBorcSorgu.setTckNo(sorgulananBorcBilgi.getTckn());
                        gibBorcSorgu.setGibDosyaId(sorgulananBorcBilgi.getGibDosyaId());
                        gibBorcSorguService.kaydet(gibBorcSorgu);
                    }
                }
                else {
                    sorgulananBorcBilgi.setGibBorcDosyasiIslendi(false);
                }
            }
        }

        yeniSorgulananBorcBilgi.setGibDosyaId(null);
        yeniSorgulananBorcBilgi.setToplamGibBorcu(BigDecimal.ZERO);
        yeniSorgulananBorcBilgi.setGibMutabakatSaglandi(false);
        yeniSorgulananBorcBilgi.setVergiDaireKod(null);
        yeniSorgulananBorcBilgi.setVergiDairesiAdi(null);
        yeniSorgulananBorcBilgi.setVergiDairesiIbanNo(null);
        yeniSorgulananBorcBilgi.setGibBorcDosyasiIslendi(false);
        yeniSorgulananBorcBilgi.setSgkIbanNo(Constants.SGK_IBAN);
        yeniSorgulananBorcBilgi.setSorguTarihi(today);
        yeniSorgulananBorcBilgi.setTckn(sorgulananBorcBilgi.getTckn());
        yeniSorgulananBorcBilgi.setVkn(sorgulananBorcBilgi.getVkn());
        yeniSorgulananBorcBilgi.setToplamSgkBorcu(BigDecimal.ZERO);
        yeniSorgulananBorcBilgi.setOdenenSgkBorcu(BigDecimal.ZERO);
        yeniSorgulananBorcBilgi.setOdenecekSgkBorcu(BigDecimal.ZERO);
        yeniSorgulananBorcBilgi.setOdenenGibBorcu(BigDecimal.ZERO);
        yeniSorgulananBorcBilgi.setOdenecekGibBorcu(BigDecimal.ZERO);
        yeniSorgulananBorcBilgi.setDeleted(false);
        yeniSorgulananBorcBilgi.setSgkBorcDosyasiIslendi(false);
        yeniSorgulananBorcBilgi.setGibBorcDosyasiIslendi(false);
        yeniSorgulananBorcBilgi.setBorclarHakediseGoreDagitildi(false);
        yeniSorgulananBorcBilgi.setSgkMutabakatSaglandi(false);
        yeniSorgulananBorcBilgi.setGibMutabakatSaglandi(false);
        yeniSorgulananBorcBilgi.setTahsilatTarihi(null);
        yeniSorgulananBorcBilgi.setTahsilatId(null);
        yeniSorgulananBorcBilgi.setKaydinIlkAtildigiTarih(sorgulananBorcBilgi.getKaydinIlkAtildigiTarih());
        yeniSorgulananBorcBilgi.setSorguDurum(SorgulananBorcDurumEnum.SORGU_DOSYA_ID_BEKLIYOR.getKod());
        yeniSorgulananBorcBilgi.setGuncelleyenKullaniciId(0);
        return sorgulananBorcBilgiService.kaydet(yeniSorgulananBorcBilgi);
    }


    private SorgulananBorcBilgi borcSorgusuOlustur(String vkNo, String tckNo) {
        Date today = new Date();
        SorgulananBorcBilgi sorgulananBorcBilgi = new SorgulananBorcBilgi();
        sorgulananBorcBilgi.setSgkDosyaId(null);
        GibBorcSorgu gibBorcSorguFromDb = gibBorcSorguService.getGibBorcSorgu(sorgulananBorcBilgi.getTckn(), sorgulananBorcBilgi.getVkn(), today);
        if(gibBorcSorguFromDb == null)  {
            sorgulananBorcBilgi.setGibDosyaId(null);
        } else {
            sorgulananBorcBilgi.setGibDosyaId(gibBorcSorguFromDb.getGibDosyaId());
        }
        sorgulananBorcBilgi.setSorguTarihi(today);
        sorgulananBorcBilgi.setSorguDurum(SorgulananBorcDurumEnum.SORGU_DOSYA_ID_BEKLIYOR.getKod());
        sorgulananBorcBilgi.setToplamGibBorcu(BigDecimal.ZERO);
        sorgulananBorcBilgi.setToplamSgkBorcu(BigDecimal.ZERO);
        sorgulananBorcBilgi.setOdenecekGibBorcu(BigDecimal.ZERO);
        sorgulananBorcBilgi.setOdenecekSgkBorcu(BigDecimal.ZERO);
        sorgulananBorcBilgi.setOdenenSgkBorcu(BigDecimal.ZERO);
        sorgulananBorcBilgi.setOdenenGibBorcu(BigDecimal.ZERO);
        sorgulananBorcBilgi.setTckn(tckNo);
        sorgulananBorcBilgi.setVkn(vkNo);
        sorgulananBorcBilgi.setSgkIbanNo(Constants.SGK_IBAN);
        sorgulananBorcBilgi.setSgkBorcDosyasiIslendi(false);
        sorgulananBorcBilgi.setGibBorcDosyasiIslendi(false);
        sorgulananBorcBilgi.setBorclarHakediseGoreDagitildi(false);
        sorgulananBorcBilgi.setSgkMutabakatSaglandi(false);
        sorgulananBorcBilgi.setGibMutabakatSaglandi(false);
        sorgulananBorcBilgi.setDeleted(false);
        sorgulananBorcBilgi.setYaratanKullaniciId(0);
        sorgulananBorcBilgi.setYaratmaZaman(LocalDateTime.now());
        sorgulananBorcBilgi.setGuncelleyenKullaniciId(0);
        sorgulananBorcBilgi.setGuncellemeZaman(LocalDateTime.now());
        sorgulananBorcBilgi.setKaydinIlkAtildigiTarih(today);
        sorgulananBorcBilgi = sorgulananBorcBilgiService.kaydet(sorgulananBorcBilgi);
        return sorgulananBorcBilgi;
    }

    private void borcBilgisiKaydet(List<Provizyon> provizyonList, BigDecimal odenecekSgkBorcu, BigDecimal odenecekGibBorcu,
                                   SorgulananBorcBilgi sorgulananBorcBilgi) throws Exception {
        logger.info("BorcIslemleriServiceImpl","borcBilgisiKaydet", "Borç bilgisi kaydetme işlemleri başladı.");
        // Buraya gelen provizyonList hakedişe göre büyükten küçüğe sıralı.
        BigDecimal kalanGibBorcu = odenecekGibBorcu;
        BigDecimal kalanSgkBorcu = odenecekSgkBorcu;
        for (Provizyon provizyon : provizyonList) {
            BigDecimal provizyonTutar = provizyon.getHakedisTutari();
            // Provizyon, ilk olarak GİB borcuna yediriliyor.
            if (kalanGibBorcu.compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal currentBorcMiktari;
                if (provizyonTutar.compareTo(kalanGibBorcu) > 0) {
                    currentBorcMiktari = kalanGibBorcu;
                    provizyonTutar = provizyonTutar.subtract(kalanGibBorcu);
                    kalanGibBorcu = BigDecimal.ZERO;
                } else {
                    // provizyon: 10 bin, gib borcu: 10 bin ya da 11 bin
                    currentBorcMiktari = provizyonTutar;
                    kalanGibBorcu = kalanGibBorcu.subtract(provizyonTutar);
                    provizyonTutar = BigDecimal.ZERO; // ilgili provizyonun tamamı GİB borcuna gitmiş oldu.
                }
                borcBilgiKaydet(provizyon, currentBorcMiktari, BorcTipEnum.GIB, sorgulananBorcBilgi);
            }

            // GİB ödemesinden sonra provizyonda hala para kaldıysa SGK borcu ödenecek
            if (provizyonTutar.compareTo(BigDecimal.ZERO) > 0) {
                if (kalanSgkBorcu.compareTo(BigDecimal.ZERO) > 0) {
                    // SGK borcu kaldıysa
                    BigDecimal currentBorcMiktari;
                    if (provizyonTutar.compareTo(kalanSgkBorcu) > 0) {
                        // provizyonda kalan tutar: 5 bin, kalan sgk borcu: 3 bin ise
                        currentBorcMiktari = kalanSgkBorcu;
                        kalanSgkBorcu = BigDecimal.ZERO; // sgk borcu artık kalmadı.
                    } else {
                        // provizyonda kalan tutar: 5 bin, kalan sgk borcu: 5 bin ya da 6 bin ise
                        currentBorcMiktari = provizyonTutar;
                        kalanSgkBorcu = kalanSgkBorcu.subtract(provizyonTutar);
                    }
                    // provizyonTutar'ın güncellenmesine gerek yok.
                    borcBilgiKaydet(provizyon, currentBorcMiktari, BorcTipEnum.SGK, sorgulananBorcBilgi);
                }
            }
        }
    }

    private void borcBilgiKaydet(Provizyon provizyon, BigDecimal borcMiktari, BorcTipEnum borcTipi, SorgulananBorcBilgi sorgulananBorcBilgi) throws Exception {
        logger.info("BorcIslemleriServiceImpl","borcBilgiKaydet", "Borç bilgi kaydetme işlemi başladı.");
        BorcBilgi borcBilgisi = new BorcBilgi();
        borcBilgisi.setSubeId(String.valueOf(provizyon.getSubeId().intValue()));
        borcBilgisi.setProvizyon(provizyon);
        int bkod = 0;
        if (BorcTipEnum.SGK.equals(borcTipi)) {
            bkod = Integer.parseInt(sorgulananBorcBilgi.getSgkIbanNo().substring(4, 9));
            borcBilgisi.setEftHesapNo(sorgulananBorcBilgi.getSgkIbanNo());
            borcBilgisi.setAliciAdi(Constants.SGK_ADI);
            borcBilgisi.setBorcTipi(BorcTipEnum.SGK.getKod());
            borcBilgisi.setSgkNumarasi(BigDecimal.ZERO); // TODO: GÖKHAN
        } else if (BorcTipEnum.GIB.equals(borcTipi)) {
            bkod = Integer.parseInt(sorgulananBorcBilgi.getVergiDairesiIbanNo().substring(4, 9));
            borcBilgisi.setEftHesapNo(sorgulananBorcBilgi.getVergiDairesiIbanNo());
            borcBilgisi.setAliciAdi(sorgulananBorcBilgi.getVergiDairesiAdi());
            borcBilgisi.setBorcTipi(BorcTipEnum.GIB.getKod());
            borcBilgisi.setVergiDaireKod(sorgulananBorcBilgi.getVergiDaireKod());
        }
        EftSube eftSube = bankaSubeService.getBankaSube(String.valueOf(bkod), String.valueOf(Constants.EFT_IBAN_SUBEKODU));
        borcBilgisi.setEftBankaKod(eftSube.getBankaKod());
        borcBilgisi.setEftSubeKod(eftSube.getKod());
        borcBilgisi.setTutar(borcMiktari);
        borcBilgisi.setKalanTutar(borcMiktari);
        borcBilgisi.setIslemDurum(BorcIslemEnum.YENI_GIRILMIS.getKod());
        borcBilgisi.setAciklama1(null);
        borcBilgisi.setAciklama2(null);
        borcBilgisi.setOdemeMuhasebeIstekId(null);
        borcBilgisi.setOdemeHareketReferansId(null);
        borcBilgisi.setGirisSicil(provizyon.getOnaySicil());
        borcBilgisi.setOdemeSicil(null);
        borcBilgisi.setDeleted(false);
        borcBilgisi.setIptalSicil(null);
        borcBilgisi.setGirisZaman(LocalDateTime.now());
        borcBilgisi.setOdemeZaman(null);
        borcBilgisi.setIptalZaman(null);
        borcBilgisi.setYaratanKullaniciId(Integer.parseInt(provizyon.getOnaySicil()));
        borcBilgisi.setYaratmaZaman(LocalDateTime.now());
        borcBilgisi.setGuncelleyenKullaniciId(Integer.parseInt(provizyon.getOnaySicil()));
        borcBilgisi.setGuncellemeZaman(LocalDateTime.now());
        borcBilgisiService.save(borcBilgisi);
    }

    private List<Long> getOdenmemisTahakkukIdList(List<SorgulananBorcBilgiTahakkuk> sorgulananBorcBilgiTahakkukList) {
        logger.info("BorcIslemleriServiceImpl","getOdenmemisTahakkukIdList", "Ödenmemiş Tahakkuk id listesi getirme işlemi başladı.");
        Set<Long> tahakkukIdSet = new HashSet<>();
        for (SorgulananBorcBilgiTahakkuk sorgulananBorcBilgiTahakkuk : sorgulananBorcBilgiTahakkukList) {
            List<ProvizyonTalep> provizyonTalepList = provizyonTalepService.getProvizyonTalepByTahakkukId(sorgulananBorcBilgiTahakkuk.getTahakkukId());
            for (ProvizyonTalep provizyonTalep : provizyonTalepList) {
                if (provizyonTalep.getDurum().equals(ProvizyonTalepDurum.OdemeyeHazir.getKod())) {
                    tahakkukIdSet.add(sorgulananBorcBilgiTahakkuk.getTahakkukId());
                }
            }
        }
        return new ArrayList<>(tahakkukIdSet);
    }

    private BigDecimal getToplamTutarInProvizyonListesi(List<Provizyon> provizyonList) {
        logger.info("BorcIslemleriServiceImpl","getToplamTutarInProvizyonListesi", "Provizyon listesindeki toplam tutarı bulma işlemi başladı.");
        BigDecimal totalMiktar = BigDecimal.ZERO;
        if (provizyonList != null) {
            for (Provizyon provizyon : provizyonList) {
                totalMiktar = totalMiktar.add(provizyon.getHakedisTutari());
            }
        }
        return totalMiktar;
    }

    private BigDecimal getToplamTutarInMahsupProvizyonListesi(List<Provizyon> provizyonList) {
        logger.info("BorcIslemleriServiceImpl","getToplamTutarInMahsupProvizyonListesi", "Mahsup Provizyon listesindeki toplam tutarı bulma işlemi başladı.");
        BigDecimal totalMiktar = BigDecimal.ZERO;
        if (provizyonList != null) {
            for (Provizyon provizyon : provizyonList) {
                if(provizyon.getKarar().isMahsupKarar()) {
                    totalMiktar = totalMiktar.add(provizyon.getHakedisTutari());
                }
            }
        }
        return totalMiktar;
    }

    private void provizyonListesiniMiktaraGoreBuyuktenKucugeSirala(List<Provizyon> provizyonList) {
        provizyonList.sort(Comparator.comparing(Provizyon::getHakedisTutari).reversed());
        logger.info("BorcIslemleriServiceImpl","provizyonListesiniMiktaraGoreBuyuktenKucugeSirala", "Provizyon listesi hak edişlerine göre büyükten küçüğe sıralandı.");
    }

    public String getTahakkukBilgileri(SorgulananBorcBilgi sorgulananBilgi) {
        List<SorgulananBorcBilgiTahakkuk> sorgulananBorcBilgiTahakkukList = sorgulananBorcBilgiTahakkukService.getSorgulananBorcBilgiTahakkukList(sorgulananBilgi.getId());
        StringBuilder tahakkukBilgileriStr = new StringBuilder();
        for(SorgulananBorcBilgiTahakkuk sorgulananBorcBilgiTahakkuk : sorgulananBorcBilgiTahakkukList) {
            Tahakkuk tahakkuk = tahakkukIslemleriService.getTahakkuk(sorgulananBorcBilgiTahakkuk.getTahakkukId());
            if(tahakkuk != null)  {
                tahakkukBilgileriStr.append(" - ")
                        .append(KararTipiEnum.getBykod(tahakkuk.getTur())).append(" türü, ")
                        .append(tahakkuk.getYil()).append(" yılı, ")
                        .append(tahakkuk.getBelgeNo()).append(" belge numaralı - ");
            }
        }
        tahakkukBilgileriStr.append(" tahakkuklarında hak edişi bulunan ");
        return tahakkukBilgileriStr.toString();
    }

    public String getOdenebilirTahakkukBilgileri(SorgulananBorcBilgi sorgulananBilgi) {
        List<SorgulananBorcBilgiTahakkuk> sorgulananBorcBilgiTahakkukList = sorgulananBorcBilgiTahakkukService.getSorgulananBorcBilgiTahakkukList(sorgulananBilgi.getId());
        StringBuilder tahakkukBilgileriStr = new StringBuilder();
        for(SorgulananBorcBilgiTahakkuk sorgulananBorcBilgiTahakkuk : sorgulananBorcBilgiTahakkukList) {
            Tahakkuk tahakkuk = tahakkukIslemleriService.getTahakkuk(sorgulananBorcBilgiTahakkuk.getTahakkukId());
            if(tahakkuk != null && isTahakkukArtikOdenebilir(tahakkuk.getId()))  {
                tahakkukBilgileriStr.append(" - ")
                        .append(KararTipiEnum.getBykod(tahakkuk.getTur())).append(" türü, ")
                        .append(tahakkuk.getYil()).append(" yılı, ")
                        .append(tahakkuk.getBelgeNo()).append(" belge numaralı - ");
            }
        }
        tahakkukBilgileriStr.append(" ödenebilir tahakkuklarında hak edişi bulunan ");
        return tahakkukBilgileriStr.toString();
    }

    private boolean isTahakkukArtikOdenebilir(Long tahakkukId) {
        List<SorgulananBorcBilgi> sorgulananBorcBilgiList = sorgulananBorcBilgiService.getSorgulananBorcBilgiByTahakkukId(tahakkukId);
        return !sorgulananBorcBilgiList.isEmpty() && sadeceAltiVeOnVar(sorgulananBorcBilgiList) && odemeyeHazirMi(tahakkukId);
    }

    private boolean sadeceAltiVeOnVar(List<SorgulananBorcBilgi> sbbList) {
        boolean sadeceAltiVeOnVar = true;

        for(SorgulananBorcBilgi sbb : sbbList) {
            if(!(sbb.getSorguDurum().equals("6") || sbb.getSorguDurum().equals("10"))) {
                sadeceAltiVeOnVar = false;
                break;
            }
        }

        return sadeceAltiVeOnVar;
    }

    private boolean odemeyeHazirMi(Long tahakkukId) {
        boolean odemeyeHazirMi = false;
        List<ProvizyonTalep> provizyonTalepler = provizyonTalepService.getProvizyonTalepByTahakkukId(tahakkukId);
        for (ProvizyonTalep provizyonTalep : provizyonTalepler) {
            if (provizyonTalep.getDurum().equals(ProvizyonTalepDurum.OdemeyeHazir.getKod())) {
                odemeyeHazirMi = true;
                break;
            }
        }

        return odemeyeHazirMi;
    }
}


----sonar


C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\classes\spring\mailSenderBeans.xml
[DEBUG] Copying file static\banner.txt
[DEBUG] file banner.txt has a filtered file extension
[DEBUG] Using 'UTF-8' encoding to copy filtered resource 'banner.txt'.
[DEBUG] copy C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\resources\static\banner.txt to C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\classes\static\banner.txt
[DEBUG] Copying file tahakkukcetveli\dfif2.xsd
[DEBUG] file dfif2.xsd has a filtered file extension
[DEBUG] Using 'UTF-8' encoding to copy filtered resource 'dfif2.xsd'.
[DEBUG] copy C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\resources\tahakkukcetveli\dfif2.xsd to C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\classes\tahakkukcetveli\dfif2.xsd
[DEBUG] Copying file wsdl\BorcuYokturWS.wsdl
[DEBUG] file BorcuYokturWS.wsdl has a filtered file extension
[DEBUG] Using 'UTF-8' encoding to copy filtered resource 'BorcuYokturWS.wsdl'.
[DEBUG] copy C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\resources\wsdl\BorcuYokturWS.wsdl to C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\classes\wsdl\BorcuYokturWS.wsdl
[DEBUG] Copying file wsdl\BorcuYokturWS.xsd
[DEBUG] file BorcuYokturWS.xsd has a filtered file extension
[DEBUG] Using 'UTF-8' encoding to copy filtered resource 'BorcuYokturWS.xsd'.
[DEBUG] copy C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\resources\wsdl\BorcuYokturWS.xsd to C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\classes\wsdl\BorcuYokturWS.xsd
[DEBUG] no use filter components
[INFO] 
[INFO] --- maven-compiler-plugin:3.11.0:compile (default-compile) @ OGMDFIFSE ---
[DEBUG] Using mirror tcmb-internal-repo (https://atlas.tcmb.gov.tr/nexus/repository/maven2-default-dependency/) for ow2-snapshot (https://repository.ow2.org/nexus/content/repositories/snapshots).
[DEBUG] Dependency collection stats: {ConflictMarker.analyzeTime=15500, ConflictMarker.markTime=11300, ConflictMarker.nodeCount=17, ConflictIdSorter.graphTime=6100, ConflictIdSorter.topsortTime=8300, ConflictIdSorter.conflictIdCount=12, ConflictIdSorter.conflictIdCycleCount=0, ConflictResolver.totalTime=54800, ConflictResolver.conflictItemCount=17, DefaultDependencyCollector.collectTime=32491000, DefaultDependencyCollector.transformTime=110700}
[DEBUG] org.apache.maven.plugins:maven-compiler-plugin:jar:3.11.0
[DEBUG]    org.apache.maven.shared:maven-shared-utils:jar:3.3.4:compile
[DEBUG]       commons-io:commons-io:jar:2.6:compile
[DEBUG]    org.apache.maven.shared:maven-shared-incremental:jar:1.1:compile
[DEBUG]       org.codehaus.plexus:plexus-component-annotations:jar:1.5.5:compile
[DEBUG]    org.codehaus.plexus:plexus-java:jar:1.1.2:compile
[DEBUG]       org.ow2.asm:asm:jar:9.4:compile
[DEBUG]       com.thoughtworks.qdox:qdox:jar:2.0.3:compile (version managed from default)
[DEBUG]    org.codehaus.plexus:plexus-compiler-api:jar:2.13.0:compile
[DEBUG]       org.codehaus.plexus:plexus-utils:jar:3.5.0:compile (version managed from default)
[DEBUG]    org.codehaus.plexus:plexus-compiler-manager:jar:2.13.0:compile
[DEBUG]    org.codehaus.plexus:plexus-compiler-javac:jar:2.13.0:runtime
[DEBUG] Created new class realm plugin>org.apache.maven.plugins:maven-compiler-plugin:3.11.0
[DEBUG] Importing foreign packages into class realm plugin>org.apache.maven.plugins:maven-compiler-plugin:3.11.0
[DEBUG]   Imported:  < maven.api
[DEBUG] Populating class realm plugin>org.apache.maven.plugins:maven-compiler-plugin:3.11.0
[DEBUG]   Included: org.apache.maven.plugins:maven-compiler-plugin:jar:3.11.0
[DEBUG]   Included: org.apache.maven.shared:maven-shared-utils:jar:3.3.4
[DEBUG]   Included: commons-io:commons-io:jar:2.6
[DEBUG]   Included: org.apache.maven.shared:maven-shared-incremental:jar:1.1
[DEBUG]   Included: org.codehaus.plexus:plexus-component-annotations:jar:1.5.5
[DEBUG]   Included: org.codehaus.plexus:plexus-java:jar:1.1.2
[DEBUG]   Included: org.ow2.asm:asm:jar:9.4
[DEBUG]   Included: com.thoughtworks.qdox:qdox:jar:2.0.3
[DEBUG]   Included: org.codehaus.plexus:plexus-compiler-api:jar:2.13.0
[DEBUG]   Included: org.codehaus.plexus:plexus-utils:jar:3.5.0
[DEBUG]   Included: org.codehaus.plexus:plexus-compiler-manager:jar:2.13.0
[DEBUG]   Included: org.codehaus.plexus:plexus-compiler-javac:jar:2.13.0
[DEBUG] Configuring mojo org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile from plugin realm ClassRealm[plugin>org.apache.maven.plugins:maven-compiler-plugin:3.11.0, parent: jdk.internal.loader.ClassLoaders$AppClassLoader@6ed3ef1]
[DEBUG] Configuring mojo 'org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile' with basic configurator -->
[DEBUG]   (f) basedir = C:\Users\k017253\IdeaProjects\ogm\ogmdfifse
[DEBUG]   (f) buildDirectory = C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target
[DEBUG]   (f) compilePath = [C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\classes, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-data-jpa\2.4.3\spring-boot-starter-data-jpa-2.4.3.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-aop\2.4.3\spring-boot-starter-aop-2.4.3.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-aop\5.3.4\spring-aop-5.3.4.jar, C:\Users\k017253\.m2\repository\org\aspectj\aspectjweaver\1.9.6\aspectjweaver-1.9.6.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-jdbc\2.4.3\spring-boot-starter-jdbc-2.4.3.jar, C:\Users\k017253\.m2\repository\com\zaxxer\HikariCP\3.4.5\HikariCP-3.4.5.jar, C:\Users\k017253\.m2\repository\jakarta\transaction\jakarta.transaction-api\1.3.3\jakarta.transaction-api-1.3.3.jar, C:\Users\k017253\.m2\repository\jakarta\persistence\jakarta.persistence-api\2.2.3\jakarta.persistence-api-2.2.3.jar, C:\Users\k017253\.m2\repository\org\hibernate\hibernate-core\5.4.28.Final\hibernate-core-5.4.28.Final.jar, C:\Users\k017253\.m2\repository\org\jboss\logging\jboss-logging\3.4.1.Final\jboss-logging-3.4.1.Final.jar, C:\Users\k017253\.m2\repository\org\javassist\javassist\3.27.0-GA\javassist-3.27.0-GA.jar, C:\Users\k017253\.m2\repository\antlr\antlr\2.7.7\antlr-2.7.7.jar, C:\Users\k017253\.m2\repository\org\jboss\jandex\2.2.3.Final\jandex-2.2.3.Final.jar, C:\Users\k017253\.m2\repository\org\dom4j\dom4j\2.1.3\dom4j-2.1.3.jar, C:\Users\k017253\.m2\repository\org\hibernate\common\hibernate-commons-annotations\5.1.2.Final\hibernate-commons-annotations-5.1.2.Final.jar, C:\Users\k017253\.m2\repository\org\glassfish\jaxb\jaxb-runtime\2.3.3\jaxb-runtime-2.3.3.jar, C:\Users\k017253\.m2\repository\org\glassfish\jaxb\txw2\2.3.3\txw2-2.3.3.jar, C:\Users\k017253\.m2\repository\com\sun\istack\istack-commons-runtime\3.0.11\istack-commons-runtime-3.0.11.jar, C:\Users\k017253\.m2\repository\org\springframework\data\spring-data-jpa\2.4.5\spring-data-jpa-2.4.5.jar, C:\Users\k017253\.m2\repository\org\springframework\data\spring-data-commons\2.4.5\spring-data-commons-2.4.5.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-orm\5.3.4\spring-orm-5.3.4.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-tx\5.3.4\spring-tx-5.3.4.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-beans\5.3.4\spring-beans-5.3.4.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-aspects\5.3.4\spring-aspects-5.3.4.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-web\2.4.3\spring-boot-starter-web-2.4.3.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter\2.4.3\spring-boot-starter-2.4.3.jar, C:\Users\k017253\.m2\repository\org\yaml\snakeyaml\1.27\snakeyaml-1.27.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-json\2.4.3\spring-boot-starter-json-2.4.3.jar, C:\Users\k017253\.m2\repository\com\fasterxml\jackson\datatype\jackson-datatype-jdk8\2.11.4\jackson-datatype-jdk8-2.11.4.jar, C:\Users\k017253\.m2\repository\com\fasterxml\jackson\module\jackson-module-parameter-names\2.11.4\jackson-module-parameter-names-2.11.4.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-tomcat\2.4.3\spring-boot-starter-tomcat-2.4.3.jar, C:\Users\k017253\.m2\repository\org\apache\tomcat\embed\tomcat-embed-core\9.0.43\tomcat-embed-core-9.0.43.jar, C:\Users\k017253\.m2\repository\org\apache\tomcat\embed\tomcat-embed-websocket\9.0.43\tomcat-embed-websocket-9.0.43.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-web\5.3.4\spring-web-5.3.4.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-webmvc\5.3.4\spring-webmvc-5.3.4.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-expression\5.3.4\spring-expression-5.3.4.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-validation\2.4.3\spring-boot-starter-validation-2.4.3.jar, C:\Users\k017253\.m2\repository\org\glassfish\jakarta.el\3.0.3\jakarta.el-3.0.3.jar, C:\Users\k017253\.m2\repository\org\hibernate\validator\hibernate-validator\6.1.7.Final\hibernate-validator-6.1.7.Final.jar, C:\Users\k017253\.m2\repository\jakarta\validation\jakarta.validation-api\2.0.2\jakarta.validation-api-2.0.2.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-actuator\2.4.3\spring-boot-starter-actuator-2.4.3.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-actuator-autoconfigure\2.4.3\spring-boot-actuator-autoconfigure-2.4.3.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-actuator\2.4.3\spring-boot-actuator-2.4.3.jar, C:\Users\k017253\.m2\repository\io\micrometer\micrometer-core\1.6.4\micrometer-core-1.6.4.jar, C:\Users\k017253\.m2\repository\org\hdrhistogram\HdrHistogram\2.1.12\HdrHistogram-2.1.12.jar, C:\Users\k017253\.m2\repository\org\apache\pdfbox\pdfbox\2.0.22\pdfbox-2.0.22.jar, C:\Users\k017253\.m2\repository\org\apache\pdfbox\fontbox\2.0.22\fontbox-2.0.22.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-mail\2.4.3\spring-boot-starter-mail-2.4.3.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-context-support\5.3.4\spring-context-support-5.3.4.jar, C:\Users\k017253\.m2\repository\com\sun\mail\jakarta.mail\1.6.5\jakarta.mail-1.6.5.jar, C:\Users\k017253\.m2\repository\com\sun\activation\jakarta.activation\1.2.2\jakarta.activation-1.2.2.jar, C:\Users\k017253\.m2\repository\org\checkerframework\checker-qual\3.5.0\checker-qual-3.5.0.jar, C:\Users\k017253\.m2\repository\org\apache\commons\commons-lang3\3.11\commons-lang3-3.11.jar, C:\Users\k017253\.m2\repository\io\springfox\springfox-swagger2\2.9.2\springfox-swagger2-2.9.2.jar, C:\Users\k017253\.m2\repository\io\swagger\swagger-annotations\1.5.20\swagger-annotations-1.5.20.jar, C:\Users\k017253\.m2\repository\io\swagger\swagger-models\1.5.20\swagger-models-1.5.20.jar, C:\Users\k017253\.m2\repository\io\springfox\springfox-spi\2.9.2\springfox-spi-2.9.2.jar, C:\Users\k017253\.m2\repository\io\springfox\springfox-core\2.9.2\springfox-core-2.9.2.jar, C:\Users\k017253\.m2\repository\io\springfox\springfox-schema\2.9.2\springfox-schema-2.9.2.jar, C:\Users\k017253\.m2\repository\io\springfox\springfox-swagger-common\2.9.2\springfox-swagger-common-2.9.2.jar, C:\Users\k017253\.m2\repository\io\springfox\springfox-spring-web\2.9.2\springfox-spring-web-2.9.2.jar, C:\Users\k017253\.m2\repository\com\google\guava\guava\20.0\guava-20.0.jar, C:\Users\k017253\.m2\repository\com\fasterxml\classmate\1.5.1\classmate-1.5.1.jar, C:\Users\k017253\.m2\repository\org\slf4j\slf4j-api\1.7.30\slf4j-api-1.7.30.jar, C:\Users\k017253\.m2\repository\org\springframework\plugin\spring-plugin-core\1.2.0.RELEASE\spring-plugin-core-1.2.0.RELEASE.jar, C:\Users\k017253\.m2\repository\org\springframework\plugin\spring-plugin-metadata\1.2.0.RELEASE\spring-plugin-metadata-1.2.0.RELEASE.jar, C:\Users\k017253\.m2\repository\org\mapstruct\mapstruct\1.2.0.Final\mapstruct-1.2.0.Final.jar, C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-SECURITY\1.0.0-18\BIEPLTFMD-SECURITY-1.0.0-18.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-security\2.4.3\spring-boot-starter-security-2.4.3.jar, C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-config\5.4.5\spring-security-config-5.4.5.jar, C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-web\5.4.5\spring-security-web-5.4.5.jar, C:\Users\k017253\.m2\repository\commons-codec\commons-codec\1.15\commons-codec-1.15.jar, C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-LOG\1.0.0-8\BIEPLTFMD-LOG-1.0.0-8.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-logging\2.4.3\spring-boot-starter-logging-2.4.3.jar, C:\Users\k017253\.m2\repository\ch\qos\logback\logback-classic\1.2.3\logback-classic-1.2.3.jar, C:\Users\k017253\.m2\repository\ch\qos\logback\logback-core\1.2.3\logback-core-1.2.3.jar, C:\Users\k017253\.m2\repository\org\apache\logging\log4j\log4j-to-slf4j\2.13.3\log4j-to-slf4j-2.13.3.jar, C:\Users\k017253\.m2\repository\org\slf4j\jul-to-slf4j\1.7.30\jul-to-slf4j-1.7.30.jar, C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-DBUTIL243\1.0.0-3\BIEPLTFMD-DBUTIL243-1.0.0-3.jar, C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-EDSUTIL\1.0.0-16\BIEPLTFMD-EDSUTIL-1.0.0-16.jar, C:\Users\k017253\.m2\repository\com\auth0\java-jwt\3.10.1\java-jwt-3.10.1.jar, C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-REACTIVEEDSUTIL\1.0.0-5\BIEPLTFMD-REACTIVEEDSUTIL-1.0.0-5.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-webflux\2.4.3\spring-boot-starter-webflux-2.4.3.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-reactor-netty\2.4.3\spring-boot-starter-reactor-netty-2.4.3.jar, C:\Users\k017253\.m2\repository\io\projectreactor\netty\reactor-netty-http\1.0.4\reactor-netty-http-1.0.4.jar, C:\Users\k017253\.m2\repository\io\netty\netty-codec-http\4.1.59.Final\netty-codec-http-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-common\4.1.59.Final\netty-common-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-buffer\4.1.59.Final\netty-buffer-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-transport\4.1.59.Final\netty-transport-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-codec\4.1.59.Final\netty-codec-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-handler\4.1.59.Final\netty-handler-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-codec-http2\4.1.59.Final\netty-codec-http2-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-resolver-dns\4.1.59.Final\netty-resolver-dns-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-resolver\4.1.59.Final\netty-resolver-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-codec-dns\4.1.59.Final\netty-codec-dns-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-resolver-dns-native-macos\4.1.59.Final\netty-resolver-dns-native-macos-4.1.59.Final-osx-x86_64.jar, C:\Users\k017253\.m2\repository\io\netty\netty-transport-native-unix-common\4.1.59.Final\netty-transport-native-unix-common-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-transport-native-epoll\4.1.59.Final\netty-transport-native-epoll-4.1.59.Final-linux-x86_64.jar, C:\Users\k017253\.m2\repository\io\projectreactor\netty\reactor-netty-core\1.0.4\reactor-netty-core-1.0.4.jar, C:\Users\k017253\.m2\repository\io\netty\netty-handler-proxy\4.1.59.Final\netty-handler-proxy-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\io\netty\netty-codec-socks\4.1.59.Final\netty-codec-socks-4.1.59.Final.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-webflux\5.3.4\spring-webflux-5.3.4.jar, C:\Users\k017253\.m2\repository\io\projectreactor\reactor-core\3.4.3\reactor-core-3.4.3.jar, C:\Users\k017253\.m2\repository\org\reactivestreams\reactive-streams\1.0.3\reactive-streams-1.0.3.jar, C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-AUDIT\1.0.0-9\BIEPLTFMD-AUDIT-1.0.0-9.jar, C:\Users\k017253\.m2\repository\org\apache\commons\commons-collections4\4.4\commons-collections4-4.4.jar, C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-WEB\1.0.0-2\BIEPLTFMD-WEB-1.0.0-2.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-cache\2.4.3\spring-boot-starter-cache-2.4.3.jar, C:\Users\k017253\.m2\repository\jakarta\xml\bind\jakarta.xml.bind-api\2.3.3\jakarta.xml.bind-api-2.3.3.jar, C:\Users\k017253\.m2\repository\jakarta\activation\jakarta.activation-api\1.2.2\jakarta.activation-api-1.2.2.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-core\5.3.4\spring-core-5.3.4.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-jcl\5.3.4\spring-jcl-5.3.4.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-devtools\2.4.3\spring-boot-devtools-2.4.3.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot\2.4.3\spring-boot-2.4.3.jar, C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-autoconfigure\2.4.3\spring-boot-autoconfigure-2.4.3.jar, C:\Users\k017253\.m2\repository\javax\mail\mail\1.4.7\mail-1.4.7.jar, C:\Users\k017253\.m2\repository\javax\activation\activation\1.1\activation-1.1.jar, C:\Users\k017253\.m2\repository\com\vaadin\external\google\android-json\0.0.20131108.vaadin1\android-json-0.0.20131108.vaadin1.jar, C:\Users\k017253\.m2\repository\com\google\code\gson\gson\2.8.6\gson-2.8.6.jar, C:\Users\k017253\.m2\repository\org\apache\httpcomponents\httpclient\4.5.13\httpclient-4.5.13.jar, C:\Users\k017253\.m2\repository\org\apache\httpcomponents\httpcore\4.4.14\httpcore-4.4.14.jar, C:\Users\k017253\.m2\repository\SUBMUHB\SUBMUHBMD-PIKUR\2.7.0-7\SUBMUHBMD-PIKUR-2.7.0-7.jar, C:\Users\k017253\.m2\repository\org\codehaus\jackson\jackson-core-asl\1.9.9\jackson-core-asl-1.9.9.jar, C:\Users\k017253\.m2\repository\org\codehaus\jackson\jackson-mapper-asl\1.9.9\jackson-mapper-asl-1.9.9.jar, C:\Users\k017253\.m2\repository\tcmb\platform\security\R2_9_18\security-R2_9_18.jar, C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-core\5.4.5\spring-security-core-5.4.5.jar, C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-core-tiger\2.0.8.RELEASE\spring-security-core-tiger-2.0.8.RELEASE.jar, C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-taglibs\5.4.5\spring-security-taglibs-5.4.5.jar, C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-acl\5.4.5\spring-security-acl-5.4.5.jar, C:\Users\k017253\.m2\repository\com\sun\identity\openssoclientsdk\tcmb.8.0_patched\openssoclientsdk-tcmb.8.0_patched.jar, C:\Users\k017253\.m2\repository\tcmb\platform\util\R2_9_16\util-R2_9_16.jar, C:\Users\k017253\.m2\repository\com\ibm\icu\icu4j\52.1\icu4j-52.1.jar, C:\Users\k017253\.m2\repository\tcmb\platform\printer\R2_9_0\printer-R2_9_0.jar, C:\Users\k017253\.m2\repository\com\cyberark\javapasswordsdk\9.95.0.0\javapasswordsdk-9.95.0.0.jar, C:\Users\k017253\.m2\repository\com\fasterxml\jackson\datatype\jackson-datatype-jsr310\2.11.4\jackson-datatype-jsr310-2.11.4.jar, C:\Users\k017253\.m2\repository\commons-lang\commons-lang\2.6\commons-lang-2.6.jar, C:\Users\k017253\.m2\repository\tcmb\platform\xml\R2_9_0\xml-R2_9_0.jar, C:\Users\k017253\.m2\repository\jaxen\jaxen\1.2.0\jaxen-1.2.0.jar, C:\Users\k017253\.m2\repository\org\apache\xmlbeans\xmlbeans-xpath\2.3.0\xmlbeans-xpath-2.3.0.jar, C:\Users\k017253\.m2\repository\commons-logging\commons-logging\1.1\commons-logging-1.1.jar, C:\Users\k017253\.m2\repository\log4j\log4j\1.2.12\log4j-1.2.12.jar, C:\Users\k017253\.m2\repository\logkit\logkit\1.0.1\logkit-1.0.1.jar, C:\Users\k017253\.m2\repository\avalon-framework\avalon-framework\4.1.3\avalon-framework-4.1.3.jar, C:\Users\k017253\.m2\repository\javax\servlet\servlet-api\2.3\servlet-api-2.3.jar, C:\Users\k017253\.m2\repository\com\fasterxml\jackson-module-hibernate\1.9.1\jackson-module-hibernate-1.9.1.jar, C:\Users\k017253\.m2\repository\com\fasterxml\jackson\core\jackson-databind\2.13.4\jackson-databind-2.13.4.jar, C:\Users\k017253\.m2\repository\com\fasterxml\jackson\core\jackson-core\2.13.4\jackson-core-2.13.4.jar, C:\Users\k017253\.m2\repository\com\fasterxml\jackson\core\jackson-annotations\2.13.4\jackson-annotations-2.13.4.jar, C:\Users\k017253\.m2\repository\MGMOSYP\MGMOSYPMD-MODEL\1.3.0-16\MGMOSYPMD-MODEL-1.3.0-16.jar, C:\Users\k017253\.m2\repository\org\apache\poi\poi-ooxml\5.2.3\poi-ooxml-5.2.3.jar, C:\Users\k017253\.m2\repository\org\apache\poi\poi\5.2.3\poi-5.2.3.jar, C:\Users\k017253\.m2\repository\org\apache\commons\commons-math3\3.6.1\commons-math3-3.6.1.jar, C:\Users\k017253\.m2\repository\com\zaxxer\SparseBitSet\1.2\SparseBitSet-1.2.jar, C:\Users\k017253\.m2\repository\org\apache\poi\poi-ooxml-lite\5.2.3\poi-ooxml-lite-5.2.3.jar, C:\Users\k017253\.m2\repository\org\apache\commons\commons-compress\1.21\commons-compress-1.21.jar, C:\Users\k017253\.m2\repository\commons-io\commons-io\2.11.0\commons-io-2.11.0.jar, C:\Users\k017253\.m2\repository\com\github\virtuald\curvesapi\1.07\curvesapi-1.07.jar, C:\Users\k017253\.m2\repository\org\apache\logging\log4j\log4j-api\2.13.3\log4j-api-2.13.3.jar, C:\Users\k017253\.m2\repository\org\docx4j\docx4j\6.1.2\docx4j-6.1.2.jar, C:\Users\k017253\.m2\repository\org\plutext\jaxb-svg11\1.0.2\jaxb-svg11-1.0.2.jar, C:\Users\k017253\.m2\repository\net\engio\mbassador\1.2.4.2\mbassador-1.2.4.2.jar, C:\Users\k017253\.m2\repository\org\slf4j\jcl-over-slf4j\1.7.30\jcl-over-slf4j-1.7.30.jar, C:\Users\k017253\.m2\repository\org\slf4j\slf4j-log4j12\1.7.30\slf4j-log4j12-1.7.30.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\xmlgraphics-commons\2.3\xmlgraphics-commons-2.3.jar, C:\Users\k017253\.m2\repository\org\apache\avalon\framework\avalon-framework-api\4.3.1\avalon-framework-api-4.3.1.jar, C:\Users\k017253\.m2\repository\org\apache\avalon\framework\avalon-framework-impl\4.3.1\avalon-framework-impl-4.3.1.jar, C:\Users\k017253\.m2\repository\xalan\xalan\2.7.2\xalan-2.7.2.jar, C:\Users\k017253\.m2\repository\xalan\serializer\2.7.2\serializer-2.7.2.jar, C:\Users\k017253\.m2\repository\net\arnx\wmf2svg\0.9.8\wmf2svg-0.9.8.jar, C:\Users\k017253\.m2\repository\org\antlr\antlr-runtime\3.5.2\antlr-runtime-3.5.2.jar, C:\Users\k017253\.m2\repository\org\antlr\stringtemplate\3.2.1\stringtemplate-3.2.1.jar, C:\Users\k017253\.m2\repository\com\thedeanda\lorem\2.1\lorem-2.1.jar, C:\Users\k017253\.m2\repository\org\docx4j\docx4j-export-fo\6.1.0\docx4j-export-fo-6.1.0.jar, C:\Users\k017253\.m2\repository\org\plutext\jaxb-xslfo\1.0.1\jaxb-xslfo-1.0.1.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop\2.6\fop-2.6.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop-util\2.6\fop-util-2.6.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop-events\2.6\fop-events-2.6.jar, C:\Users\k017253\.m2\repository\com\thoughtworks\qdox\qdox\1.12\qdox-1.12.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop-core\2.6\fop-core-2.6.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-anim\1.14\batik-anim-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-css\1.14\batik-css-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-dom\1.14\batik-dom-1.14.jar, C:\Users\k017253\.m2\repository\xml-apis\xml-apis\1.4.01\xml-apis-1.4.01.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-ext\1.14\batik-ext-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-parser\1.14\batik-parser-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-shared-resources\1.14\batik-shared-resources-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-svg-dom\1.14\batik-svg-dom-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-util\1.14\batik-util-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-constants\1.14\batik-constants-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-i18n\1.14\batik-i18n-1.14.jar, C:\Users\k017253\.m2\repository\xml-apis\xml-apis-ext\1.3.04\xml-apis-ext-1.3.04.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-awt-util\1.14\batik-awt-util-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-bridge\1.14\batik-bridge-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-script\1.14\batik-script-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-xml\1.14\batik-xml-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-extension\1.14\batik-extension-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-gvt\1.14\batik-gvt-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-transcoder\1.14\batik-transcoder-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-svggen\1.14\batik-svggen-1.14.jar, C:\Users\k017253\.m2\repository\org\apache\xmlbeans\xmlbeans\5.1.1\xmlbeans-5.1.1.jar, C:\Users\k017253\.m2\repository\org\apache\poi\ooxml-schemas\1.4\ooxml-schemas-1.4.jar, C:\Users\k017253\.m2\repository\com\itextpdf\itextpdf\5.5.0\itextpdf-5.5.0.jar, C:\Users\k017253\.m2\repository\com\sun\xml\ws\jaxws-rt\2.3.3\jaxws-rt-2.3.3.jar, C:\Users\k017253\.m2\repository\com\sun\xml\ws\policy\2.7.10\policy-2.7.10.jar, C:\Users\k017253\.m2\repository\com\sun\xml\bind\jaxb-impl\2.3.3\jaxb-impl-2.3.3.jar, C:\Users\k017253\.m2\repository\org\glassfish\ha\ha-api\3.1.12\ha-api-3.1.12.jar, C:\Users\k017253\.m2\repository\org\glassfish\external\management-api\3.2.2\management-api-3.2.2.jar, C:\Users\k017253\.m2\repository\org\glassfish\gmbal\gmbal\4.0.1\gmbal-4.0.1.jar, C:\Users\k017253\.m2\repository\org\glassfish\pfl\pfl-tf\4.1.0\pfl-tf-4.1.0.jar, C:\Users\k017253\.m2\repository\org\glassfish\pfl\pfl-basic\4.1.0\pfl-basic-4.1.0.jar, C:\Users\k017253\.m2\repository\org\jvnet\staxex\stax-ex\1.8.3\stax-ex-1.8.3.jar, C:\Users\k017253\.m2\repository\com\sun\xml\stream\buffer\streambuffer\1.5.9\streambuffer-1.5.9.jar, C:\Users\k017253\.m2\repository\org\jvnet\mimepull\mimepull\1.9.13\mimepull-1.9.13.jar, C:\Users\k017253\.m2\repository\com\sun\xml\fastinfoset\FastInfoset\1.2.18\FastInfoset-1.2.18.jar, C:\Users\k017253\.m2\repository\com\sun\xml\ws\jaxws-tools\2.3.3\jaxws-tools-2.3.3.jar, C:\Users\k017253\.m2\repository\com\sun\xml\bind\jaxb-xjc\2.3.3\jaxb-xjc-2.3.3.jar, C:\Users\k017253\.m2\repository\com\sun\xml\bind\jaxb-jxc\2.3.3\jaxb-jxc-2.3.3.jar, C:\Users\k017253\.m2\repository\com\sun\xml\ws\jaxws-eclipselink-plugin\2.3.3\jaxws-eclipselink-plugin-2.3.3.jar, C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.moxy\2.7.6\org.eclipse.persistence.moxy-2.7.6.jar, C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.core\2.7.6\org.eclipse.persistence.core-2.7.6.jar, C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.asm\2.7.6\org.eclipse.persistence.asm-2.7.6.jar, C:\Users\k017253\.m2\repository\com\sun\xml\ws\sdo-eclipselink-plugin\2.3.3\sdo-eclipselink-plugin-2.3.3.jar, C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.sdo\2.7.6\org.eclipse.persistence.sdo-2.7.6.jar, C:\Users\k017253\.m2\repository\org\eclipse\persistence\commonj.sdo\2.1.1\commonj.sdo-2.1.1.jar, C:\Users\k017253\.m2\repository\jakarta\xml\ws\jakarta.xml.ws-api\2.3.3\jakarta.xml.ws-api-2.3.3.jar, C:\Users\k017253\.m2\repository\jakarta\xml\soap\jakarta.xml.soap-api\1.4.2\jakarta.xml.soap-api-1.4.2.jar, C:\Users\k017253\.m2\repository\jakarta\jws\jakarta.jws-api\2.1.0\jakarta.jws-api-2.1.0.jar, C:\Users\k017253\.m2\repository\jakarta\annotation\jakarta.annotation-api\1.3.5\jakarta.annotation-api-1.3.5.jar, C:\Users\k017253\.m2\repository\org\mockito\mockito-core\3.6.28\mockito-core-3.6.28.jar, C:\Users\k017253\.m2\repository\net\bytebuddy\byte-buddy\1.10.20\byte-buddy-1.10.20.jar, C:\Users\k017253\.m2\repository\net\bytebuddy\byte-buddy-agent\1.10.20\byte-buddy-agent-1.10.20.jar, C:\Users\k017253\.m2\repository\org\objenesis\objenesis\3.1\objenesis-3.1.jar, C:\Users\k017253\.m2\repository\net\javacrumbs\shedlock\shedlock-spring\4.44.0\shedlock-spring-4.44.0.jar, C:\Users\k017253\.m2\repository\net\javacrumbs\shedlock\shedlock-core\4.44.0\shedlock-core-4.44.0.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-context\5.3.4\spring-context-5.3.4.jar, C:\Users\k017253\.m2\repository\net\javacrumbs\shedlock\shedlock-provider-jdbc-template\4.44.0\shedlock-provider-jdbc-template-4.44.0.jar, C:\Users\k017253\.m2\repository\org\springframework\spring-jdbc\5.3.4\spring-jdbc-5.3.4.jar, C:\Users\k017253\.m2\repository\com\github\ben-manes\caffeine\caffeine\3.1.8\caffeine-3.1.8.jar, C:\Users\k017253\.m2\repository\com\google\errorprone\error_prone_annotations\2.21.1\error_prone_annotations-2.21.1.jar, C:\Users\k017253\.m2\repository\org\projectlombok\lombok\1.18.28\lombok-1.18.28.jar]
[DEBUG]   (f) compileSourceRoots = [C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java]
[DEBUG]   (f) compilerArgs = [-Xlint:unchecked, -Xlint:deprecation]
[DEBUG]   (f) compilerId = javac
[DEBUG]   (f) createMissingPackageInfoClass = true
[DEBUG]   (f) debug = true
[DEBUG]   (f) debugFileName = javac
[DEBUG]   (f) enablePreview = false
[DEBUG]   (f) encoding = UTF-8
[DEBUG]   (f) failOnError = true
[DEBUG]   (f) failOnWarning = false
[DEBUG]   (f) forceJavacCompilerUse = false
[DEBUG]   (f) fork = true
[DEBUG]   (f) generatedSourcesDirectory = C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\generated-sources\annotations
[DEBUG]   (f) mojoExecution = org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile {execution: default-compile}
[DEBUG]   (f) optimize = false
[DEBUG]   (f) outputDirectory = C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\classes
[DEBUG]   (f) parameters = true
[DEBUG]   (f) project = MavenProject: OGMDFIF:OGMDFIFSE:0.0.1 @ C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\pom.xml
[DEBUG]   (f) projectArtifact = OGMDFIF:OGMDFIFSE:jar:0.0.1
[DEBUG]   (f) session = org.apache.maven.execution.MavenSession@479111ba
[DEBUG]   (f) showCompilationChanges = false
[DEBUG]   (f) showDeprecation = false
[DEBUG]   (f) showWarnings = true
[DEBUG]   (f) skipMultiThreadWarning = false
[DEBUG]   (f) source = 11
[DEBUG]   (f) staleMillis = 0
[DEBUG]   (s) target = 11
[DEBUG]   (f) useIncrementalCompilation = true
[DEBUG]   (f) verbose = false
[DEBUG] -- end configuration --
[DEBUG] Using compiler 'javac'.
[DEBUG] Adding C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\generated-sources\annotations to compile source roots:
  C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java
[DEBUG] New compile source roots:
  C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java
  C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\generated-sources\annotations
[DEBUG] CompilerReuseStrategy: reuseCreated
[DEBUG] useIncrementalCompilation enabled
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\IhracatciTakipHesapConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\EftBilgiYonetimService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TalepOzetHandler.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\Borc.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDaireleri.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TahakkukService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\KararIslemleriController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\cache\EftBankaSubeServiceResponseCache.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\jobs\JobDefinition.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ItemSender.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\SorgulananBorcBilgiConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\BostakiTahakkukDetayServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonArsivListelemeDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\KararDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\MuhasebeClientService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ManuelTahakkukPaketiEkleRequestDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\BostakiTahakkukDetay.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkTalepSorguBorc.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterNotificationLogConverterService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\RestConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ApiGenericResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\ProvizyonTalepConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\specs\GenericSpecification.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterRequestConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ApiServiceResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\annotations\AuditSelect.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ProvizyonTalep.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\fileProcessing\FileProcessDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\ServisRequestDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\MektupTipEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterRequestTransactionsServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\SecurityConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgula22AResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\dto\MesajDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\AnlikBorcOdemeDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\HakedisRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ProvizyonTalepRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkTahsilatKaydetResult.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\GibServiceClient.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\TicaretBakanligiServiceClientImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\AnlikBorcConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SubeOdemeGroupDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ReferansMailAdres.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\IhracatciBirlikServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\EftBilgiYonetim.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\EbimHareketDurum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\ProvizyonOnayDurumConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\ProvizyonConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SubeBazindaHakedisDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\AnlikBorcRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\LogConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\TahakkukSatiri.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\AnlikBorcDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\SorgulananBorcDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\EftBilgisiYonetimArsivRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\DisServisIsletimJob.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\base\DtoConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\EftBilgisiYonetimRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\GibBorcSorguRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\StandartBildirimHandler.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ReferansServisAdresDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SubeProvizyonIslemleriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ReferansKodBilgi.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDaireleriOutput.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\ScopeTypeEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\KararOnayRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\HakedisDevir.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkTalepSorguBorcDetay.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\BorcBilgiConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\KurTipiEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\LetterItemTxService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SorgulananBorcBilgiYedekRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\KurClientServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\EbimTaslak.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\SgkServiceRestUrls.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterAttemptId.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\LetterJobTxService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ProvizyonTalepIslemleriController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonArsivDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\EmirConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\DetayPikur.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\WebClientConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\MesajDurumTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BostakiTahakkukDetayListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterRequestConverterService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\referans\ReferansDegiskenBilgiKaydiMevcutException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\BorcBilgiArsiv.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\KararListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\EbimHareketDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\enums\MuhasebeDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\DisServisIsletimServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\BorcTipEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\SingleDeserializer.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ReferansServisAdres.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\KisiTaslak.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\KararTipiEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SgkEftGunlukParametreRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\HesapController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\WebClientCallException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\PlatformWebConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgula23A.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\referans\ReferansMailAdresiKaydiMevcutException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ReferansMailAdresRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\TahakkukIslemResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SorgulananBorcBilgiTahakkukService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\BankaServiceRestUrls.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\LetterItemDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\CreateManuelTahakkukPaketDetayRequestDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\TurkishCharacterUtil.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgulaDigerResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\TahakkukServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\SubeKoduEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\BostakiTahakkukDetayRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MektupService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDairesiBorcDetayiKIK.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ReferansDegiskenBilgiServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\PageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\BaseResponseKasMesaj.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\ServisTaslak.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ReferansServisAdresController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SorgulananBorcBilgi.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\ErrorModel.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\TbBorcOdemeDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\ZbFirmaSgkTahsilatYapDto.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\IhracatciBirlik.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\LogAuditServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\ZiraatBankasiService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SorgulananBorcBilgiTahakkuk.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\TahakkukDetay.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\TahakkukSatirDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\GibBorcSorguServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\cache\SubeKoduServiceResponseCache.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\TahakkukKarar.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\TbBorcOdemeDetayDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\EmirDurumEnumConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\IhracatciTakipHesapController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ProvizyonTalepOdemeService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturKaydetOutput.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\EmirIslemleriRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\base\EntityConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BostakiDetayAtaDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\OdemeMantiksalGrupService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\IdempotencyService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\annotations\AuditAll.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Hakedis.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukKararDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonProjectionExtended.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Provizyon.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\LetterRequestRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\OdemeMantiksalGrupRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Karar.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\ObjectMapperConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\AttachmentDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\EftBilgiYonetimProjection.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SgkEftGunlukParametreService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\ProvizyonTalepDurumConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\EftBilgiYonetimArsivProjection.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SorgulananBorcBilgiServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\BankaClientService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\dto\MesajArsivDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SorgulananBorcBilgiTahakkukServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\ZbWebServiceUrls.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\DateUtils.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\PikurDonusumService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\KararDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgula22A.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\SubeTaslak.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\TahakkukDurumEnumConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\UlkeTaslak.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\UserController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\AnlikBorcHesapTaslakDto.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDaireleriResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\dto\GelenMesajArsivDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\rest\RestServiceNotFoundException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\KesintiAlinisTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterAttempt.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\TicaretTahakkukResponseIslem.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\EdsUtilConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\FaturaBilgiPikur.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\EpostaServiceRestUrls.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\HakedisDevirDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\HakedisDevirListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\IhracatciIslemleriController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\Ihracatci.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDairesiBorcDetayi.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\CollectionDeserializer.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\HataMesaji.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonTalepListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonArsivProjection.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ReferansServisAdresService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\KararConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\TahakkukListesi.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\HakedisIslemleriController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonDosyaOdemeRequestDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\UserLoginInfoDto.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\TbBorcOdemeListesiDetayDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\IslemKod.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\HesapServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\rest\RestException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\GenericResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\AnlikBorcHesap.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\MuhasebeIslemOzet.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\UpdateHakedisBakiyeDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\WebConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftBankaMSResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\HakedisIslemleriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftSubeMSListResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\HakedisDevirDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\MailMessage.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\IhracatciTipiEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\specs\SearchCriteria.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ApigwMSCallerService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\Attachment.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\dto\DuzenlenenMesajDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\handler\OdemeMektupLetterHandler.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MailFacadeImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SorgulananBorcBilgiTahakkukYedekRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SubeProvizyonIslemleriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\IhracatciTakipHesapDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\ProvizyonTalepDurum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\IhracatciIslemleriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\IhracatciOdemeDurumuEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\dto\GidenMesajArsivDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SorgulananBorcBilgiDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\BorcIslemleriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\EftBilgiYonetimArsiv.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\IhracatciTakipHesapListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\ValidatorUtil.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\BorcBilgiArsivConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\EftOdemeMediatorDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\EftSaosBilgiPikur.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\dto\PikurData.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\LetterProcessingJob.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SorgulananBorcBilgiService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterItemId.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\BorcBilgiProjection.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\MuhasebeOnaySureciEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\AnlikBorcIslemleriJob.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\GibBorcSorgulaSonucDetayAsenkron.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\TahakkukPaketiDosyasiConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\GibServiceClientImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\ZiraatBankasiIslemleriJob.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\FileProcessingUtil.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TahakkukKararService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgulaKIK.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturSorgu22AOutput.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukPaketiDosyasiDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\HesapTipEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ReferansDegiskenBilgiService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\FisTaslak.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SgkBorcSorgu.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BorcBilgiDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Audit.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\IDisServiceIsletimService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\servisDto\MuhasebeBilgiDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\GibSorgulananBorcBilgiDetayServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SgkMSCallerService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgula23AResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\AdresTaslak.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\GibBorcSorgulaTalebiSonucAsenkron.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\EpostaGonderimService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ReferansServisAdresServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\DuzenleyenTipiEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\event\SharedDataEvent.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterItemConverterService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukPaketiDosyasiRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\HakedisDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\WebServiceLogService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\DilekceSorguInput.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BaseDTOImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\EmirIslemleriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\UniqueProvizyonEbimDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\KurDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\UniqueProvizyonTalepDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgulaKIKResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\EPostaResponseMessage.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\PathKeyEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\KararOnay.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\MailContext.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\WebServiceLogServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\FirmaSGKTahsilatYapCevapDetayObject.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\ZiraatBankasiResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\GetHataKodlariResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ProvizyonIslemleriRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\OrtakMektupIslemlerServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\KesintiTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukSubeIliskilendirDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\GibSorgulananBorcBilgiDetay.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\GelenMesajDurumTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\RestUrlHolder.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\YapilmisOdemeTurEnumConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ProvizyonIslemleriController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\BorcBilgiArsivRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\Adres.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\handler\TahakkukCetveliValidationHandler.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\BorcBilgiRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\SaosMesajTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\HesapBilgisiUyumsuzException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\AnlikBorcListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\HareketTaslakPikur.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SubeProvizyonDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\GenelException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftBankaMSListResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\ProvizyonOnayDurum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturWS_Service.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\KurIslemleriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukDetayRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\BorcBilgiService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ProvizyonIslemleriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\EFTClientService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterItemConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\LetterNotifyLogDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\KisiTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\TahakkukDosyasiKararTipiEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\referans\ReferansKodBilgiKaydiMevcutException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\Borclar.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SgkMutabakat.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ReferansDegiskenBilgiRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ProvizyonTalepOdemeServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\OrtakMuhasebeClientService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\BorcSorgulaRequestAsenkron.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\YetkiException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonListelemeDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\KararRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\handler\LetterHandlerFactory.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ReferansMailAdresServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\HareketTaslakWithRequestId.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\IhracatciIslemleriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\PikurConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\GibSorgulananBorcBilgiDetayRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\rest\RestUtils.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ReferansMailAdresController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDairesiBorcDetayi22A.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\WebServiceLogRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\DbUtilConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonArsivProjectionExtended.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LogAuditService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\EpostaGonderimServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\VergiKimlikNo.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\TbTahakkukDuzenlemeDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\Constants.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\GibBorcSorgulaSonucAsenkron.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgulaResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\EftSube.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\TahakkukPaketiDosyasiServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\YapilmisOdemeListPageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\TahakkukPaket.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\MesajTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\MuhasebeIslemRequest.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\BaseController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonTalepIcmalDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\MesajIslemSonuc.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\base\BaseConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\EmirDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SgkEftGunlukParametre.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\BankaSubeServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\FirmaSGKBorcSorguCevapDetayObject.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\HakedisDevirOlusturDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\HakedisListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonIdProjection.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SorgulananBorcBilgiTahakkukRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\referans\ReferansServisAdresiKaydiMevcutException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\handler\GlobalExceptionHandler.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SgkEftGunlukParametreServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\ServisTakipNoTipEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\ServisTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\OnOffKod.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ReferansDegiskenBilgiDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\BorcAlacakTurKod.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\SAMUtils.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\ProvizyonArsivConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\ErrorResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\TahsilatKaydetRequestDto.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\IhracatciBirlikService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ProvizyonIslemleriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SgkBorcIslemleriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SgkBorcIslemleriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\EbimTaslakPikur.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\api\LogAudit.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SubeProvizyonListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Emir.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonDosyaTalepDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\ModulUtil.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\SchedulerConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonProjection.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\UnsupportedItemSender.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TahakkukPaketiDosyasiService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\model\response\BaseResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\GidenMesajDurumTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\FisTaslakPikur.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\Kur.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\BorcBilgiController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\BaseResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\IhracatciBirlikDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\HareketTaslak.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\HesapKarakterKod.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\TicaretBakanligiServiceClient.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\KullaniciBilgileriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDairesiBorcDetayi23A.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturSorguDigerOutput.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\DilekceBorcuYokturKaydetIslemiResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\OdemeMantiksalGrupDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\MuhasebeClientServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\EftBanka.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\TahakkukCetveli.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\BostakiTahakkukDetayService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\EmirListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ReferansKodBilgiDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturSorgu23AOutput.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\HareketKodu.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\OdemeMantiksalGrupServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\YapilmisOdemeServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\HataBildirimHandler.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\jobs\TypedJobs.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\StringUtil.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukPaketListDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ReferansKodBilgiController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\YapilmisOdemeDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturWS.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\GetHataKodlari.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\OrtakBorcIslemleriUygulaJob.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SgkBorcSorguRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SgkBorcSorguService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\annotations\AuditInsert.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturKaydetInput.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TahakkukIslemleriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\EbimRequest.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\EmirIslemleriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterNotificationLogServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\SubeProvizyonIslemleriController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\IBAN.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\cache\KurServiceResponseCache.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\AnlikBorcSorguDurumEnumConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\EPostaDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\SehirEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\IslemOzetRequest.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturSorguKIKOutput.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\DilekceBorcuYokturKaydetIslemi.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\OdemeSekliEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\BorcBilgiArsivProjection.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ProvizyonTalepArsivRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ProvizyonArsivIslemleriRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterNotificationLogConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDairesiBorcDetayiDiger.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\BostakiTahakkukDetayConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\WebServiceLog.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\HakedisIslemleriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\GibBorcSorgu.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\KurIslemleriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\DynamicJobRegistry.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BorcBilgiListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\HataliEftKontrolEtJob.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\SaosClientServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\RestServiceHandler.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\HesapTaslak.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\ValidationException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\LetterRequestDto.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\LetterStatusEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SorgulananBorcBilgiRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\MailServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\BankaClientServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\IhracatciTakipHesapIslemDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterRequestId.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SorgulananBorcBilgiTahakkukYedek.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftGenericResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\HakedisDevirIslemYonuEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\HesapOnlemKod.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterRequestTransactionService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\ZiraatBankasiClient.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterNotificationLogService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\PikurTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\EpostaServiceMailClient.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ReferansKodBilgiService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\servisDto\ParaBirimiDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\SaosClientService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\YapilmisOdemeTurEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\CreateTahakkukPaketDetayForDosyaUploadRequestDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\ProcessRegistry.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\LetterItemRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\KasMesajResponseMessage.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\event\LetterRequestCreatedEvent.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonArsivIdProjection.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\OptionDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\BorcBilgiServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\BorcIslemEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgulaDiger.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\TahakkukBorcDetay.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\IhracatciIslemDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\enums\MuhasebeHataKodEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\AnlikBorcHesapRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\YapilmisOdemelerController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukBorcDetayRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\MektupController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\IIdempotencyService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ProvizyonTalepServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\BankaSubeService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\YapilmisOdemeService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\annotations\AuditUpdate.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\OrtakMektupIslemlerService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\AnlikBorcDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\MuhasebeController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\AsyncConfig.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukDetayDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\EFTClientServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\OdemeItemSender.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\KurTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\LetterAttemptRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MailHandler.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\DovizTipiEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\SgkBorcIslemleriJob.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturSorguOutput.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\HakedisConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\MailTypeEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\enums\FisIslemTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\rest\RestAuthorizationException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonOdemeYapRequestDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\TahakkukPaketResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ReferansServisAdresRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ProvizyonOdemeRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MailClient.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\PropertyReader.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\SearchOperationEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ProvizyonTalepService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\BaglantiliBilgiMevcutException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgula.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\OrtakMuhasebeClientServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\Durum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\TahakkukListesiDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\GibBorcIslemleriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\EftBilgisiYonetimServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SgkBorcTahsilat.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\ValorluTransferBilgiPikur.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\PikurDonusumServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\GibSorgulananBorcBilgiDetayService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ParaDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\GibBorcIslemleriJob.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukDosyaYuklenmeDurumRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\IhracatciBirlikConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\AnlikBorc.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\MutabakatBilgi.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\ExportedFile.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\rest\RestStatusCodeException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\interceptor\AuditInterceptor.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\ZiraatBankasiServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\OrtakMuhasebeRequestIdGenerator.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\DevirIslemDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ReferansKodBilgiServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\YedekConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\BaseResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ProvizyonOdeme.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\GenericMSCallerService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\SgkClientService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\IhracatciRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonTalepDetayDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\GecersizVeriException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterNotificationLog.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkMutabakatResult.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\dto\BorcTahsilatDto.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\SgkClientServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\ObjectFactory.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Ihracatci.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\IhracatciTakipHesapService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\enums\Crud.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\IhracatciBirlikRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\EbimOnayEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SoyutMiktarDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\OgmdfifApplication.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\TahakkukKaynakEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukDetayListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukDosyasiUploadRequestDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Tahakkuk.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkMutabakatRequestDto.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\GibBorcIslemleriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\BakiyeBilgiTaslak.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\KurClientServiceRestUrls.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\EmirIsletimJob.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\KararIslemleriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BostakiTahakkukDetayDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MailService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\ParaTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\HesapNo.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonTalepDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\TahakkukIslemleriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\TahakkukConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterItem.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SubeAnlikBorcSorgulaDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\CevapVermeyenVergiDairesi.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\TahakkukPaketiDosyasi.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\base\BaseAbstractConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\DeleteTahakkukPaketDetayRequestDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\LogAuditRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\AnlikBorcServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\event\LetterNotificationEventListener.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\IhracatciConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukKararRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ItemSenderFactory.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BorcBilgiArsivDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\IhracatciTakipHesapRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\TCKimlikNo.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\OdemeDetayDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ActionResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SorgulananBorcBilgiListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\ZbFirmaSgkBorcOkuDto.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\annotations\AuditDelete.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\MesajDurumKodlari.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\GibBorcSorguService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\MektupServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\AnlikBorcController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\IhracatciTakipHesapServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\KurPikur.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ReferansDegiskenBilgiController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\TahakkukKararServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TahakkukDosyaYuklenmeDurumService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\JobsDetayEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SorgulananBorcBilgiYedek.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SgkBorcSorguServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\TahsilatKaydetSonucDto.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\LetterRequestListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\TahakkukDosyaYuklenmeDurum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\LetterNotificationLogRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\BaseEntityImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\BorcTipEnumConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\HakedisIslemDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\MuhasebeDurumEnumConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\Banka.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SgkMutabakatRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\rest\HttpUtils.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\OnayDurum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\TahakkukIslemleriController.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\enums\EmirDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\KurClientService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ReferansDegiskenBilgi.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ReferansMailAdresService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\OdemeMantiksalGrup.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\EftServiceRestUrls.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\MektupTalepListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\HakedisDevirConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftMesajSorgulama.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\BorcIslemleriService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\SoyutMiktarStringConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\TahakkukDosyaYuklenmeDurumServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\IhracatciTakipHesap.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ProvizyonTalepArsiv.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MailFacade.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ReferansKodBilgiRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\GenelRuntimeException.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftSubeMSResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\TahakkukDetayConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterRequest.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ReferansMailAdresDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftBaseResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ItemBildirimHandler.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\handler\LetterHandler.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\KurumTip.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\KararIslemleriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\PikurResponse.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\Paket.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\TahakkukDurumEnum.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\MektupTipiEnumConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\HakedisDevirRepository.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\HesapService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\IhracatciDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\AnlikBorcService.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\IhracatciListePageDTO.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\BorcBilgi.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\KararTipiEnumConverter.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ProvizyonArsiv.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\KullaniciBilgileriServiceImpl.java
[DEBUG] Stale source detected: C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\SwaggerConfig.java
[INFO] Changes detected - recompiling the module! :source
[DEBUG] Classpath:
[DEBUG]  C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\classes
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-data-jpa\2.4.3\spring-boot-starter-data-jpa-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-aop\2.4.3\spring-boot-starter-aop-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-aop\5.3.4\spring-aop-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\aspectj\aspectjweaver\1.9.6\aspectjweaver-1.9.6.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-jdbc\2.4.3\spring-boot-starter-jdbc-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\zaxxer\HikariCP\3.4.5\HikariCP-3.4.5.jar
[DEBUG]  C:\Users\k017253\.m2\repository\jakarta\transaction\jakarta.transaction-api\1.3.3\jakarta.transaction-api-1.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\jakarta\persistence\jakarta.persistence-api\2.2.3\jakarta.persistence-api-2.2.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\hibernate\hibernate-core\5.4.28.Final\hibernate-core-5.4.28.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\jboss\logging\jboss-logging\3.4.1.Final\jboss-logging-3.4.1.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\javassist\javassist\3.27.0-GA\javassist-3.27.0-GA.jar
[DEBUG]  C:\Users\k017253\.m2\repository\antlr\antlr\2.7.7\antlr-2.7.7.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\jboss\jandex\2.2.3.Final\jandex-2.2.3.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\dom4j\dom4j\2.1.3\dom4j-2.1.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\hibernate\common\hibernate-commons-annotations\5.1.2.Final\hibernate-commons-annotations-5.1.2.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\glassfish\jaxb\jaxb-runtime\2.3.3\jaxb-runtime-2.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\glassfish\jaxb\txw2\2.3.3\txw2-2.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\istack\istack-commons-runtime\3.0.11\istack-commons-runtime-3.0.11.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\data\spring-data-jpa\2.4.5\spring-data-jpa-2.4.5.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\data\spring-data-commons\2.4.5\spring-data-commons-2.4.5.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-orm\5.3.4\spring-orm-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-tx\5.3.4\spring-tx-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-beans\5.3.4\spring-beans-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-aspects\5.3.4\spring-aspects-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-web\2.4.3\spring-boot-starter-web-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter\2.4.3\spring-boot-starter-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\yaml\snakeyaml\1.27\snakeyaml-1.27.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-json\2.4.3\spring-boot-starter-json-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\fasterxml\jackson\datatype\jackson-datatype-jdk8\2.11.4\jackson-datatype-jdk8-2.11.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\fasterxml\jackson\module\jackson-module-parameter-names\2.11.4\jackson-module-parameter-names-2.11.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-tomcat\2.4.3\spring-boot-starter-tomcat-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\tomcat\embed\tomcat-embed-core\9.0.43\tomcat-embed-core-9.0.43.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\tomcat\embed\tomcat-embed-websocket\9.0.43\tomcat-embed-websocket-9.0.43.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-web\5.3.4\spring-web-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-webmvc\5.3.4\spring-webmvc-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-expression\5.3.4\spring-expression-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-validation\2.4.3\spring-boot-starter-validation-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\glassfish\jakarta.el\3.0.3\jakarta.el-3.0.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\hibernate\validator\hibernate-validator\6.1.7.Final\hibernate-validator-6.1.7.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\jakarta\validation\jakarta.validation-api\2.0.2\jakarta.validation-api-2.0.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-actuator\2.4.3\spring-boot-starter-actuator-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-actuator-autoconfigure\2.4.3\spring-boot-actuator-autoconfigure-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-actuator\2.4.3\spring-boot-actuator-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\micrometer\micrometer-core\1.6.4\micrometer-core-1.6.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\hdrhistogram\HdrHistogram\2.1.12\HdrHistogram-2.1.12.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\pdfbox\pdfbox\2.0.22\pdfbox-2.0.22.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\pdfbox\fontbox\2.0.22\fontbox-2.0.22.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-mail\2.4.3\spring-boot-starter-mail-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-context-support\5.3.4\spring-context-support-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\mail\jakarta.mail\1.6.5\jakarta.mail-1.6.5.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\activation\jakarta.activation\1.2.2\jakarta.activation-1.2.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\checkerframework\checker-qual\3.5.0\checker-qual-3.5.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\commons\commons-lang3\3.11\commons-lang3-3.11.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\springfox\springfox-swagger2\2.9.2\springfox-swagger2-2.9.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\swagger\swagger-annotations\1.5.20\swagger-annotations-1.5.20.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\swagger\swagger-models\1.5.20\swagger-models-1.5.20.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\springfox\springfox-spi\2.9.2\springfox-spi-2.9.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\springfox\springfox-core\2.9.2\springfox-core-2.9.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\springfox\springfox-schema\2.9.2\springfox-schema-2.9.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\springfox\springfox-swagger-common\2.9.2\springfox-swagger-common-2.9.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\springfox\springfox-spring-web\2.9.2\springfox-spring-web-2.9.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\google\guava\guava\20.0\guava-20.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\fasterxml\classmate\1.5.1\classmate-1.5.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\slf4j\slf4j-api\1.7.30\slf4j-api-1.7.30.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\plugin\spring-plugin-core\1.2.0.RELEASE\spring-plugin-core-1.2.0.RELEASE.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\plugin\spring-plugin-metadata\1.2.0.RELEASE\spring-plugin-metadata-1.2.0.RELEASE.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\mapstruct\mapstruct\1.2.0.Final\mapstruct-1.2.0.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-SECURITY\1.0.0-18\BIEPLTFMD-SECURITY-1.0.0-18.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-security\2.4.3\spring-boot-starter-security-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-config\5.4.5\spring-security-config-5.4.5.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-web\5.4.5\spring-security-web-5.4.5.jar
[DEBUG]  C:\Users\k017253\.m2\repository\commons-codec\commons-codec\1.15\commons-codec-1.15.jar
[DEBUG]  C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-LOG\1.0.0-8\BIEPLTFMD-LOG-1.0.0-8.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-logging\2.4.3\spring-boot-starter-logging-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\ch\qos\logback\logback-classic\1.2.3\logback-classic-1.2.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\ch\qos\logback\logback-core\1.2.3\logback-core-1.2.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\logging\log4j\log4j-to-slf4j\2.13.3\log4j-to-slf4j-2.13.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\slf4j\jul-to-slf4j\1.7.30\jul-to-slf4j-1.7.30.jar
[DEBUG]  C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-DBUTIL243\1.0.0-3\BIEPLTFMD-DBUTIL243-1.0.0-3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-EDSUTIL\1.0.0-16\BIEPLTFMD-EDSUTIL-1.0.0-16.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\auth0\java-jwt\3.10.1\java-jwt-3.10.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-REACTIVEEDSUTIL\1.0.0-5\BIEPLTFMD-REACTIVEEDSUTIL-1.0.0-5.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-webflux\2.4.3\spring-boot-starter-webflux-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-reactor-netty\2.4.3\spring-boot-starter-reactor-netty-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\projectreactor\netty\reactor-netty-http\1.0.4\reactor-netty-http-1.0.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-codec-http\4.1.59.Final\netty-codec-http-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-common\4.1.59.Final\netty-common-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-buffer\4.1.59.Final\netty-buffer-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-transport\4.1.59.Final\netty-transport-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-codec\4.1.59.Final\netty-codec-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-handler\4.1.59.Final\netty-handler-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-codec-http2\4.1.59.Final\netty-codec-http2-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-resolver-dns\4.1.59.Final\netty-resolver-dns-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-resolver\4.1.59.Final\netty-resolver-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-codec-dns\4.1.59.Final\netty-codec-dns-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-resolver-dns-native-macos\4.1.59.Final\netty-resolver-dns-native-macos-4.1.59.Final-osx-x86_64.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-transport-native-unix-common\4.1.59.Final\netty-transport-native-unix-common-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-transport-native-epoll\4.1.59.Final\netty-transport-native-epoll-4.1.59.Final-linux-x86_64.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\projectreactor\netty\reactor-netty-core\1.0.4\reactor-netty-core-1.0.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-handler-proxy\4.1.59.Final\netty-handler-proxy-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\netty\netty-codec-socks\4.1.59.Final\netty-codec-socks-4.1.59.Final.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-webflux\5.3.4\spring-webflux-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\io\projectreactor\reactor-core\3.4.3\reactor-core-3.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\reactivestreams\reactive-streams\1.0.3\reactive-streams-1.0.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-AUDIT\1.0.0-9\BIEPLTFMD-AUDIT-1.0.0-9.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\commons\commons-collections4\4.4\commons-collections4-4.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-WEB\1.0.0-2\BIEPLTFMD-WEB-1.0.0-2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-cache\2.4.3\spring-boot-starter-cache-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\jakarta\xml\bind\jakarta.xml.bind-api\2.3.3\jakarta.xml.bind-api-2.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\jakarta\activation\jakarta.activation-api\1.2.2\jakarta.activation-api-1.2.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-core\5.3.4\spring-core-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-jcl\5.3.4\spring-jcl-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-devtools\2.4.3\spring-boot-devtools-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot\2.4.3\spring-boot-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-autoconfigure\2.4.3\spring-boot-autoconfigure-2.4.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\javax\mail\mail\1.4.7\mail-1.4.7.jar
[DEBUG]  C:\Users\k017253\.m2\repository\javax\activation\activation\1.1\activation-1.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\vaadin\external\google\android-json\0.0.20131108.vaadin1\android-json-0.0.20131108.vaadin1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\google\code\gson\gson\2.8.6\gson-2.8.6.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\httpcomponents\httpclient\4.5.13\httpclient-4.5.13.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\httpcomponents\httpcore\4.4.14\httpcore-4.4.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\SUBMUHB\SUBMUHBMD-PIKUR\2.7.0-7\SUBMUHBMD-PIKUR-2.7.0-7.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\codehaus\jackson\jackson-core-asl\1.9.9\jackson-core-asl-1.9.9.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\codehaus\jackson\jackson-mapper-asl\1.9.9\jackson-mapper-asl-1.9.9.jar
[DEBUG]  C:\Users\k017253\.m2\repository\tcmb\platform\security\R2_9_18\security-R2_9_18.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-core\5.4.5\spring-security-core-5.4.5.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-core-tiger\2.0.8.RELEASE\spring-security-core-tiger-2.0.8.RELEASE.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-taglibs\5.4.5\spring-security-taglibs-5.4.5.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-acl\5.4.5\spring-security-acl-5.4.5.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\identity\openssoclientsdk\tcmb.8.0_patched\openssoclientsdk-tcmb.8.0_patched.jar
[DEBUG]  C:\Users\k017253\.m2\repository\tcmb\platform\util\R2_9_16\util-R2_9_16.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\ibm\icu\icu4j\52.1\icu4j-52.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\tcmb\platform\printer\R2_9_0\printer-R2_9_0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\cyberark\javapasswordsdk\9.95.0.0\javapasswordsdk-9.95.0.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\fasterxml\jackson\datatype\jackson-datatype-jsr310\2.11.4\jackson-datatype-jsr310-2.11.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\commons-lang\commons-lang\2.6\commons-lang-2.6.jar
[DEBUG]  C:\Users\k017253\.m2\repository\tcmb\platform\xml\R2_9_0\xml-R2_9_0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\jaxen\jaxen\1.2.0\jaxen-1.2.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlbeans\xmlbeans-xpath\2.3.0\xmlbeans-xpath-2.3.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\commons-logging\commons-logging\1.1\commons-logging-1.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\log4j\log4j\1.2.12\log4j-1.2.12.jar
[DEBUG]  C:\Users\k017253\.m2\repository\logkit\logkit\1.0.1\logkit-1.0.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\avalon-framework\avalon-framework\4.1.3\avalon-framework-4.1.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\javax\servlet\servlet-api\2.3\servlet-api-2.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\fasterxml\jackson-module-hibernate\1.9.1\jackson-module-hibernate-1.9.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\fasterxml\jackson\core\jackson-databind\2.13.4\jackson-databind-2.13.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\fasterxml\jackson\core\jackson-core\2.13.4\jackson-core-2.13.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\fasterxml\jackson\core\jackson-annotations\2.13.4\jackson-annotations-2.13.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\MGMOSYP\MGMOSYPMD-MODEL\1.3.0-16\MGMOSYPMD-MODEL-1.3.0-16.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\poi\poi-ooxml\5.2.3\poi-ooxml-5.2.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\poi\poi\5.2.3\poi-5.2.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\commons\commons-math3\3.6.1\commons-math3-3.6.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\zaxxer\SparseBitSet\1.2\SparseBitSet-1.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\poi\poi-ooxml-lite\5.2.3\poi-ooxml-lite-5.2.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\commons\commons-compress\1.21\commons-compress-1.21.jar
[DEBUG]  C:\Users\k017253\.m2\repository\commons-io\commons-io\2.11.0\commons-io-2.11.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\github\virtuald\curvesapi\1.07\curvesapi-1.07.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\logging\log4j\log4j-api\2.13.3\log4j-api-2.13.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\docx4j\docx4j\6.1.2\docx4j-6.1.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\plutext\jaxb-svg11\1.0.2\jaxb-svg11-1.0.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\net\engio\mbassador\1.2.4.2\mbassador-1.2.4.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\slf4j\jcl-over-slf4j\1.7.30\jcl-over-slf4j-1.7.30.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\slf4j\slf4j-log4j12\1.7.30\slf4j-log4j12-1.7.30.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\xmlgraphics-commons\2.3\xmlgraphics-commons-2.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\avalon\framework\avalon-framework-api\4.3.1\avalon-framework-api-4.3.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\avalon\framework\avalon-framework-impl\4.3.1\avalon-framework-impl-4.3.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\xalan\xalan\2.7.2\xalan-2.7.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\xalan\serializer\2.7.2\serializer-2.7.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\net\arnx\wmf2svg\0.9.8\wmf2svg-0.9.8.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\antlr\antlr-runtime\3.5.2\antlr-runtime-3.5.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\antlr\stringtemplate\3.2.1\stringtemplate-3.2.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\thedeanda\lorem\2.1\lorem-2.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\docx4j\docx4j-export-fo\6.1.0\docx4j-export-fo-6.1.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\plutext\jaxb-xslfo\1.0.1\jaxb-xslfo-1.0.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop\2.6\fop-2.6.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop-util\2.6\fop-util-2.6.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop-events\2.6\fop-events-2.6.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\thoughtworks\qdox\qdox\1.12\qdox-1.12.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop-core\2.6\fop-core-2.6.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-anim\1.14\batik-anim-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-css\1.14\batik-css-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-dom\1.14\batik-dom-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\xml-apis\xml-apis\1.4.01\xml-apis-1.4.01.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-ext\1.14\batik-ext-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-parser\1.14\batik-parser-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-shared-resources\1.14\batik-shared-resources-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-svg-dom\1.14\batik-svg-dom-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-util\1.14\batik-util-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-constants\1.14\batik-constants-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-i18n\1.14\batik-i18n-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\xml-apis\xml-apis-ext\1.3.04\xml-apis-ext-1.3.04.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-awt-util\1.14\batik-awt-util-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-bridge\1.14\batik-bridge-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-script\1.14\batik-script-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-xml\1.14\batik-xml-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-extension\1.14\batik-extension-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-gvt\1.14\batik-gvt-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-transcoder\1.14\batik-transcoder-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-svggen\1.14\batik-svggen-1.14.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\xmlbeans\xmlbeans\5.1.1\xmlbeans-5.1.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\apache\poi\ooxml-schemas\1.4\ooxml-schemas-1.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\itextpdf\itextpdf\5.5.0\itextpdf-5.5.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\ws\jaxws-ri\2.3.3\jaxws-ri-2.3.3.pom
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\ws\jaxws-rt\2.3.3\jaxws-rt-2.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\ws\policy\2.7.10\policy-2.7.10.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\bind\jaxb-impl\2.3.3\jaxb-impl-2.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\glassfish\ha\ha-api\3.1.12\ha-api-3.1.12.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\glassfish\external\management-api\3.2.2\management-api-3.2.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\glassfish\gmbal\gmbal\4.0.1\gmbal-4.0.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\glassfish\pfl\pfl-tf\4.1.0\pfl-tf-4.1.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\glassfish\pfl\pfl-basic\4.1.0\pfl-basic-4.1.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\jvnet\staxex\stax-ex\1.8.3\stax-ex-1.8.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\stream\buffer\streambuffer\1.5.9\streambuffer-1.5.9.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\jvnet\mimepull\mimepull\1.9.13\mimepull-1.9.13.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\fastinfoset\FastInfoset\1.2.18\FastInfoset-1.2.18.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\ws\jaxws-tools\2.3.3\jaxws-tools-2.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\bind\jaxb-xjc\2.3.3\jaxb-xjc-2.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\bind\jaxb-jxc\2.3.3\jaxb-jxc-2.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\ws\jaxws-eclipselink-plugin\2.3.3\jaxws-eclipselink-plugin-2.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.moxy\2.7.6\org.eclipse.persistence.moxy-2.7.6.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.core\2.7.6\org.eclipse.persistence.core-2.7.6.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.asm\2.7.6\org.eclipse.persistence.asm-2.7.6.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\ws\sdo-eclipselink-plugin\2.3.3\sdo-eclipselink-plugin-2.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.sdo\2.7.6\org.eclipse.persistence.sdo-2.7.6.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\eclipse\persistence\commonj.sdo\2.1.1\commonj.sdo-2.1.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\ws\release-documentation\2.3.3\release-documentation-2.3.3-docbook.zip
[DEBUG]  C:\Users\k017253\.m2\repository\com\sun\xml\ws\samples\2.3.3\samples-2.3.3.zip
[DEBUG]  C:\Users\k017253\.m2\repository\jakarta\xml\ws\jakarta.xml.ws-api\2.3.3\jakarta.xml.ws-api-2.3.3.jar
[DEBUG]  C:\Users\k017253\.m2\repository\jakarta\xml\soap\jakarta.xml.soap-api\1.4.2\jakarta.xml.soap-api-1.4.2.jar
[DEBUG]  C:\Users\k017253\.m2\repository\jakarta\jws\jakarta.jws-api\2.1.0\jakarta.jws-api-2.1.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\jakarta\annotation\jakarta.annotation-api\1.3.5\jakarta.annotation-api-1.3.5.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\mockito\mockito-core\3.6.28\mockito-core-3.6.28.jar
[DEBUG]  C:\Users\k017253\.m2\repository\net\bytebuddy\byte-buddy\1.10.20\byte-buddy-1.10.20.jar
[DEBUG]  C:\Users\k017253\.m2\repository\net\bytebuddy\byte-buddy-agent\1.10.20\byte-buddy-agent-1.10.20.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\objenesis\objenesis\3.1\objenesis-3.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\net\javacrumbs\shedlock\shedlock-spring\4.44.0\shedlock-spring-4.44.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\net\javacrumbs\shedlock\shedlock-core\4.44.0\shedlock-core-4.44.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-context\5.3.4\spring-context-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\net\javacrumbs\shedlock\shedlock-provider-jdbc-template\4.44.0\shedlock-provider-jdbc-template-4.44.0.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\springframework\spring-jdbc\5.3.4\spring-jdbc-5.3.4.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\github\ben-manes\caffeine\caffeine\3.1.8\caffeine-3.1.8.jar
[DEBUG]  C:\Users\k017253\.m2\repository\com\google\errorprone\error_prone_annotations\2.21.1\error_prone_annotations-2.21.1.jar
[DEBUG]  C:\Users\k017253\.m2\repository\org\projectlombok\lombok\1.18.28\lombok-1.18.28.jar
[DEBUG] Source roots:
[DEBUG]  C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java
[DEBUG]  C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\generated-sources\annotations
[DEBUG] Command line options:
[DEBUG] -d C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\classes -classpath C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\classes;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-data-jpa\2.4.3\spring-boot-starter-data-jpa-2.4.3.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-aop\2.4.3\spring-boot-starter-aop-2.4.3.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-aop\5.3.4\spring-aop-5.3.4.jar;C:\Users\k017253\.m2\repository\org\aspectj\aspectjweaver\1.9.6\aspectjweaver-1.9.6.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-jdbc\2.4.3\spring-boot-starter-jdbc-2.4.3.jar;C:\Users\k017253\.m2\repository\com\zaxxer\HikariCP\3.4.5\HikariCP-3.4.5.jar;C:\Users\k017253\.m2\repository\jakarta\transaction\jakarta.transaction-api\1.3.3\jakarta.transaction-api-1.3.3.jar;C:\Users\k017253\.m2\repository\jakarta\persistence\jakarta.persistence-api\2.2.3\jakarta.persistence-api-2.2.3.jar;C:\Users\k017253\.m2\repository\org\hibernate\hibernate-core\5.4.28.Final\hibernate-core-5.4.28.Final.jar;C:\Users\k017253\.m2\repository\org\jboss\logging\jboss-logging\3.4.1.Final\jboss-logging-3.4.1.Final.jar;C:\Users\k017253\.m2\repository\org\javassist\javassist\3.27.0-GA\javassist-3.27.0-GA.jar;C:\Users\k017253\.m2\repository\antlr\antlr\2.7.7\antlr-2.7.7.jar;C:\Users\k017253\.m2\repository\org\jboss\jandex\2.2.3.Final\jandex-2.2.3.Final.jar;C:\Users\k017253\.m2\repository\org\dom4j\dom4j\2.1.3\dom4j-2.1.3.jar;C:\Users\k017253\.m2\repository\org\hibernate\common\hibernate-commons-annotations\5.1.2.Final\hibernate-commons-annotations-5.1.2.Final.jar;C:\Users\k017253\.m2\repository\org\glassfish\jaxb\jaxb-runtime\2.3.3\jaxb-runtime-2.3.3.jar;C:\Users\k017253\.m2\repository\org\glassfish\jaxb\txw2\2.3.3\txw2-2.3.3.jar;C:\Users\k017253\.m2\repository\com\sun\istack\istack-commons-runtime\3.0.11\istack-commons-runtime-3.0.11.jar;C:\Users\k017253\.m2\repository\org\springframework\data\spring-data-jpa\2.4.5\spring-data-jpa-2.4.5.jar;C:\Users\k017253\.m2\repository\org\springframework\data\spring-data-commons\2.4.5\spring-data-commons-2.4.5.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-orm\5.3.4\spring-orm-5.3.4.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-tx\5.3.4\spring-tx-5.3.4.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-beans\5.3.4\spring-beans-5.3.4.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-aspects\5.3.4\spring-aspects-5.3.4.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-web\2.4.3\spring-boot-starter-web-2.4.3.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter\2.4.3\spring-boot-starter-2.4.3.jar;C:\Users\k017253\.m2\repository\org\yaml\snakeyaml\1.27\snakeyaml-1.27.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-json\2.4.3\spring-boot-starter-json-2.4.3.jar;C:\Users\k017253\.m2\repository\com\fasterxml\jackson\datatype\jackson-datatype-jdk8\2.11.4\jackson-datatype-jdk8-2.11.4.jar;C:\Users\k017253\.m2\repository\com\fasterxml\jackson\module\jackson-module-parameter-names\2.11.4\jackson-module-parameter-names-2.11.4.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-tomcat\2.4.3\spring-boot-starter-tomcat-2.4.3.jar;C:\Users\k017253\.m2\repository\org\apache\tomcat\embed\tomcat-embed-core\9.0.43\tomcat-embed-core-9.0.43.jar;C:\Users\k017253\.m2\repository\org\apache\tomcat\embed\tomcat-embed-websocket\9.0.43\tomcat-embed-websocket-9.0.43.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-web\5.3.4\spring-web-5.3.4.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-webmvc\5.3.4\spring-webmvc-5.3.4.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-expression\5.3.4\spring-expression-5.3.4.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-validation\2.4.3\spring-boot-starter-validation-2.4.3.jar;C:\Users\k017253\.m2\repository\org\glassfish\jakarta.el\3.0.3\jakarta.el-3.0.3.jar;C:\Users\k017253\.m2\repository\org\hibernate\validator\hibernate-validator\6.1.7.Final\hibernate-validator-6.1.7.Final.jar;C:\Users\k017253\.m2\repository\jakarta\validation\jakarta.validation-api\2.0.2\jakarta.validation-api-2.0.2.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-actuator\2.4.3\spring-boot-starter-actuator-2.4.3.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-actuator-autoconfigure\2.4.3\spring-boot-actuator-autoconfigure-2.4.3.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-actuator\2.4.3\spring-boot-actuator-2.4.3.jar;C:\Users\k017253\.m2\repository\io\micrometer\micrometer-core\1.6.4\micrometer-core-1.6.4.jar;C:\Users\k017253\.m2\repository\org\hdrhistogram\HdrHistogram\2.1.12\HdrHistogram-2.1.12.jar;C:\Users\k017253\.m2\repository\org\apache\pdfbox\pdfbox\2.0.22\pdfbox-2.0.22.jar;C:\Users\k017253\.m2\repository\org\apache\pdfbox\fontbox\2.0.22\fontbox-2.0.22.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-mail\2.4.3\spring-boot-starter-mail-2.4.3.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-context-support\5.3.4\spring-context-support-5.3.4.jar;C:\Users\k017253\.m2\repository\com\sun\mail\jakarta.mail\1.6.5\jakarta.mail-1.6.5.jar;C:\Users\k017253\.m2\repository\com\sun\activation\jakarta.activation\1.2.2\jakarta.activation-1.2.2.jar;C:\Users\k017253\.m2\repository\org\checkerframework\checker-qual\3.5.0\checker-qual-3.5.0.jar;C:\Users\k017253\.m2\repository\org\apache\commons\commons-lang3\3.11\commons-lang3-3.11.jar;C:\Users\k017253\.m2\repository\io\springfox\springfox-swagger2\2.9.2\springfox-swagger2-2.9.2.jar;C:\Users\k017253\.m2\repository\io\swagger\swagger-annotations\1.5.20\swagger-annotations-1.5.20.jar;C:\Users\k017253\.m2\repository\io\swagger\swagger-models\1.5.20\swagger-models-1.5.20.jar;C:\Users\k017253\.m2\repository\io\springfox\springfox-spi\2.9.2\springfox-spi-2.9.2.jar;C:\Users\k017253\.m2\repository\io\springfox\springfox-core\2.9.2\springfox-core-2.9.2.jar;C:\Users\k017253\.m2\repository\io\springfox\springfox-schema\2.9.2\springfox-schema-2.9.2.jar;C:\Users\k017253\.m2\repository\io\springfox\springfox-swagger-common\2.9.2\springfox-swagger-common-2.9.2.jar;C:\Users\k017253\.m2\repository\io\springfox\springfox-spring-web\2.9.2\springfox-spring-web-2.9.2.jar;C:\Users\k017253\.m2\repository\com\google\guava\guava\20.0\guava-20.0.jar;C:\Users\k017253\.m2\repository\com\fasterxml\classmate\1.5.1\classmate-1.5.1.jar;C:\Users\k017253\.m2\repository\org\slf4j\slf4j-api\1.7.30\slf4j-api-1.7.30.jar;C:\Users\k017253\.m2\repository\org\springframework\plugin\spring-plugin-core\1.2.0.RELEASE\spring-plugin-core-1.2.0.RELEASE.jar;C:\Users\k017253\.m2\repository\org\springframework\plugin\spring-plugin-metadata\1.2.0.RELEASE\spring-plugin-metadata-1.2.0.RELEASE.jar;C:\Users\k017253\.m2\repository\org\mapstruct\mapstruct\1.2.0.Final\mapstruct-1.2.0.Final.jar;C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-SECURITY\1.0.0-18\BIEPLTFMD-SECURITY-1.0.0-18.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-security\2.4.3\spring-boot-starter-security-2.4.3.jar;C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-config\5.4.5\spring-security-config-5.4.5.jar;C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-web\5.4.5\spring-security-web-5.4.5.jar;C:\Users\k017253\.m2\repository\commons-codec\commons-codec\1.15\commons-codec-1.15.jar;C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-LOG\1.0.0-8\BIEPLTFMD-LOG-1.0.0-8.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-logging\2.4.3\spring-boot-starter-logging-2.4.3.jar;C:\Users\k017253\.m2\repository\ch\qos\logback\logback-classic\1.2.3\logback-classic-1.2.3.jar;C:\Users\k017253\.m2\repository\ch\qos\logback\logback-core\1.2.3\logback-core-1.2.3.jar;C:\Users\k017253\.m2\repository\org\apache\logging\log4j\log4j-to-slf4j\2.13.3\log4j-to-slf4j-2.13.3.jar;C:\Users\k017253\.m2\repository\org\slf4j\jul-to-slf4j\1.7.30\jul-to-slf4j-1.7.30.jar;C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-DBUTIL243\1.0.0-3\BIEPLTFMD-DBUTIL243-1.0.0-3.jar;C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-EDSUTIL\1.0.0-16\BIEPLTFMD-EDSUTIL-1.0.0-16.jar;C:\Users\k017253\.m2\repository\com\auth0\java-jwt\3.10.1\java-jwt-3.10.1.jar;C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-REACTIVEEDSUTIL\1.0.0-5\BIEPLTFMD-REACTIVEEDSUTIL-1.0.0-5.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-webflux\2.4.3\spring-boot-starter-webflux-2.4.3.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-reactor-netty\2.4.3\spring-boot-starter-reactor-netty-2.4.3.jar;C:\Users\k017253\.m2\repository\io\projectreactor\netty\reactor-netty-http\1.0.4\reactor-netty-http-1.0.4.jar;C:\Users\k017253\.m2\repository\io\netty\netty-codec-http\4.1.59.Final\netty-codec-http-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-common\4.1.59.Final\netty-common-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-buffer\4.1.59.Final\netty-buffer-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-transport\4.1.59.Final\netty-transport-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-codec\4.1.59.Final\netty-codec-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-handler\4.1.59.Final\netty-handler-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-codec-http2\4.1.59.Final\netty-codec-http2-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-resolver-dns\4.1.59.Final\netty-resolver-dns-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-resolver\4.1.59.Final\netty-resolver-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-codec-dns\4.1.59.Final\netty-codec-dns-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-resolver-dns-native-macos\4.1.59.Final\netty-resolver-dns-native-macos-4.1.59.Final-osx-x86_64.jar;C:\Users\k017253\.m2\repository\io\netty\netty-transport-native-unix-common\4.1.59.Final\netty-transport-native-unix-common-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-transport-native-epoll\4.1.59.Final\netty-transport-native-epoll-4.1.59.Final-linux-x86_64.jar;C:\Users\k017253\.m2\repository\io\projectreactor\netty\reactor-netty-core\1.0.4\reactor-netty-core-1.0.4.jar;C:\Users\k017253\.m2\repository\io\netty\netty-handler-proxy\4.1.59.Final\netty-handler-proxy-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\io\netty\netty-codec-socks\4.1.59.Final\netty-codec-socks-4.1.59.Final.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-webflux\5.3.4\spring-webflux-5.3.4.jar;C:\Users\k017253\.m2\repository\io\projectreactor\reactor-core\3.4.3\reactor-core-3.4.3.jar;C:\Users\k017253\.m2\repository\org\reactivestreams\reactive-streams\1.0.3\reactive-streams-1.0.3.jar;C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-AUDIT\1.0.0-9\BIEPLTFMD-AUDIT-1.0.0-9.jar;C:\Users\k017253\.m2\repository\org\apache\commons\commons-collections4\4.4\commons-collections4-4.4.jar;C:\Users\k017253\.m2\repository\BIEPLTF\BIEPLTFMD-WEB\1.0.0-2\BIEPLTFMD-WEB-1.0.0-2.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-starter-cache\2.4.3\spring-boot-starter-cache-2.4.3.jar;C:\Users\k017253\.m2\repository\jakarta\xml\bind\jakarta.xml.bind-api\2.3.3\jakarta.xml.bind-api-2.3.3.jar;C:\Users\k017253\.m2\repository\jakarta\activation\jakarta.activation-api\1.2.2\jakarta.activation-api-1.2.2.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-core\5.3.4\spring-core-5.3.4.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-jcl\5.3.4\spring-jcl-5.3.4.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-devtools\2.4.3\spring-boot-devtools-2.4.3.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot\2.4.3\spring-boot-2.4.3.jar;C:\Users\k017253\.m2\repository\org\springframework\boot\spring-boot-autoconfigure\2.4.3\spring-boot-autoconfigure-2.4.3.jar;C:\Users\k017253\.m2\repository\javax\mail\mail\1.4.7\mail-1.4.7.jar;C:\Users\k017253\.m2\repository\javax\activation\activation\1.1\activation-1.1.jar;C:\Users\k017253\.m2\repository\com\vaadin\external\google\android-json\0.0.20131108.vaadin1\android-json-0.0.20131108.vaadin1.jar;C:\Users\k017253\.m2\repository\com\google\code\gson\gson\2.8.6\gson-2.8.6.jar;C:\Users\k017253\.m2\repository\org\apache\httpcomponents\httpclient\4.5.13\httpclient-4.5.13.jar;C:\Users\k017253\.m2\repository\org\apache\httpcomponents\httpcore\4.4.14\httpcore-4.4.14.jar;C:\Users\k017253\.m2\repository\SUBMUHB\SUBMUHBMD-PIKUR\2.7.0-7\SUBMUHBMD-PIKUR-2.7.0-7.jar;C:\Users\k017253\.m2\repository\org\codehaus\jackson\jackson-core-asl\1.9.9\jackson-core-asl-1.9.9.jar;C:\Users\k017253\.m2\repository\org\codehaus\jackson\jackson-mapper-asl\1.9.9\jackson-mapper-asl-1.9.9.jar;C:\Users\k017253\.m2\repository\tcmb\platform\security\R2_9_18\security-R2_9_18.jar;C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-core\5.4.5\spring-security-core-5.4.5.jar;C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-core-tiger\2.0.8.RELEASE\spring-security-core-tiger-2.0.8.RELEASE.jar;C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-taglibs\5.4.5\spring-security-taglibs-5.4.5.jar;C:\Users\k017253\.m2\repository\org\springframework\security\spring-security-acl\5.4.5\spring-security-acl-5.4.5.jar;C:\Users\k017253\.m2\repository\com\sun\identity\openssoclientsdk\tcmb.8.0_patched\openssoclientsdk-tcmb.8.0_patched.jar;C:\Users\k017253\.m2\repository\tcmb\platform\util\R2_9_16\util-R2_9_16.jar;C:\Users\k017253\.m2\repository\com\ibm\icu\icu4j\52.1\icu4j-52.1.jar;C:\Users\k017253\.m2\repository\tcmb\platform\printer\R2_9_0\printer-R2_9_0.jar;C:\Users\k017253\.m2\repository\com\cyberark\javapasswordsdk\9.95.0.0\javapasswordsdk-9.95.0.0.jar;C:\Users\k017253\.m2\repository\com\fasterxml\jackson\datatype\jackson-datatype-jsr310\2.11.4\jackson-datatype-jsr310-2.11.4.jar;C:\Users\k017253\.m2\repository\commons-lang\commons-lang\2.6\commons-lang-2.6.jar;C:\Users\k017253\.m2\repository\tcmb\platform\xml\R2_9_0\xml-R2_9_0.jar;C:\Users\k017253\.m2\repository\jaxen\jaxen\1.2.0\jaxen-1.2.0.jar;C:\Users\k017253\.m2\repository\org\apache\xmlbeans\xmlbeans-xpath\2.3.0\xmlbeans-xpath-2.3.0.jar;C:\Users\k017253\.m2\repository\commons-logging\commons-logging\1.1\commons-logging-1.1.jar;C:\Users\k017253\.m2\repository\log4j\log4j\1.2.12\log4j-1.2.12.jar;C:\Users\k017253\.m2\repository\logkit\logkit\1.0.1\logkit-1.0.1.jar;C:\Users\k017253\.m2\repository\avalon-framework\avalon-framework\4.1.3\avalon-framework-4.1.3.jar;C:\Users\k017253\.m2\repository\javax\servlet\servlet-api\2.3\servlet-api-2.3.jar;C:\Users\k017253\.m2\repository\com\fasterxml\jackson-module-hibernate\1.9.1\jackson-module-hibernate-1.9.1.jar;C:\Users\k017253\.m2\repository\com\fasterxml\jackson\core\jackson-databind\2.13.4\jackson-databind-2.13.4.jar;C:\Users\k017253\.m2\repository\com\fasterxml\jackson\core\jackson-core\2.13.4\jackson-core-2.13.4.jar;C:\Users\k017253\.m2\repository\com\fasterxml\jackson\core\jackson-annotations\2.13.4\jackson-annotations-2.13.4.jar;C:\Users\k017253\.m2\repository\MGMOSYP\MGMOSYPMD-MODEL\1.3.0-16\MGMOSYPMD-MODEL-1.3.0-16.jar;C:\Users\k017253\.m2\repository\org\apache\poi\poi-ooxml\5.2.3\poi-ooxml-5.2.3.jar;C:\Users\k017253\.m2\repository\org\apache\poi\poi\5.2.3\poi-5.2.3.jar;C:\Users\k017253\.m2\repository\org\apache\commons\commons-math3\3.6.1\commons-math3-3.6.1.jar;C:\Users\k017253\.m2\repository\com\zaxxer\SparseBitSet\1.2\SparseBitSet-1.2.jar;C:\Users\k017253\.m2\repository\org\apache\poi\poi-ooxml-lite\5.2.3\poi-ooxml-lite-5.2.3.jar;C:\Users\k017253\.m2\repository\org\apache\commons\commons-compress\1.21\commons-compress-1.21.jar;C:\Users\k017253\.m2\repository\commons-io\commons-io\2.11.0\commons-io-2.11.0.jar;C:\Users\k017253\.m2\repository\com\github\virtuald\curvesapi\1.07\curvesapi-1.07.jar;C:\Users\k017253\.m2\repository\org\apache\logging\log4j\log4j-api\2.13.3\log4j-api-2.13.3.jar;C:\Users\k017253\.m2\repository\org\docx4j\docx4j\6.1.2\docx4j-6.1.2.jar;C:\Users\k017253\.m2\repository\org\plutext\jaxb-svg11\1.0.2\jaxb-svg11-1.0.2.jar;C:\Users\k017253\.m2\repository\net\engio\mbassador\1.2.4.2\mbassador-1.2.4.2.jar;C:\Users\k017253\.m2\repository\org\slf4j\jcl-over-slf4j\1.7.30\jcl-over-slf4j-1.7.30.jar;C:\Users\k017253\.m2\repository\org\slf4j\slf4j-log4j12\1.7.30\slf4j-log4j12-1.7.30.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\xmlgraphics-commons\2.3\xmlgraphics-commons-2.3.jar;C:\Users\k017253\.m2\repository\org\apache\avalon\framework\avalon-framework-api\4.3.1\avalon-framework-api-4.3.1.jar;C:\Users\k017253\.m2\repository\org\apache\avalon\framework\avalon-framework-impl\4.3.1\avalon-framework-impl-4.3.1.jar;C:\Users\k017253\.m2\repository\xalan\xalan\2.7.2\xalan-2.7.2.jar;C:\Users\k017253\.m2\repository\xalan\serializer\2.7.2\serializer-2.7.2.jar;C:\Users\k017253\.m2\repository\net\arnx\wmf2svg\0.9.8\wmf2svg-0.9.8.jar;C:\Users\k017253\.m2\repository\org\antlr\antlr-runtime\3.5.2\antlr-runtime-3.5.2.jar;C:\Users\k017253\.m2\repository\org\antlr\stringtemplate\3.2.1\stringtemplate-3.2.1.jar;C:\Users\k017253\.m2\repository\com\thedeanda\lorem\2.1\lorem-2.1.jar;C:\Users\k017253\.m2\repository\org\docx4j\docx4j-export-fo\6.1.0\docx4j-export-fo-6.1.0.jar;C:\Users\k017253\.m2\repository\org\plutext\jaxb-xslfo\1.0.1\jaxb-xslfo-1.0.1.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop\2.6\fop-2.6.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop-util\2.6\fop-util-2.6.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop-events\2.6\fop-events-2.6.jar;C:\Users\k017253\.m2\repository\com\thoughtworks\qdox\qdox\1.12\qdox-1.12.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\fop-core\2.6\fop-core-2.6.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-anim\1.14\batik-anim-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-css\1.14\batik-css-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-dom\1.14\batik-dom-1.14.jar;C:\Users\k017253\.m2\repository\xml-apis\xml-apis\1.4.01\xml-apis-1.4.01.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-ext\1.14\batik-ext-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-parser\1.14\batik-parser-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-shared-resources\1.14\batik-shared-resources-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-svg-dom\1.14\batik-svg-dom-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-util\1.14\batik-util-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-constants\1.14\batik-constants-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-i18n\1.14\batik-i18n-1.14.jar;C:\Users\k017253\.m2\repository\xml-apis\xml-apis-ext\1.3.04\xml-apis-ext-1.3.04.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-awt-util\1.14\batik-awt-util-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-bridge\1.14\batik-bridge-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-script\1.14\batik-script-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-xml\1.14\batik-xml-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-extension\1.14\batik-extension-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-gvt\1.14\batik-gvt-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-transcoder\1.14\batik-transcoder-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlgraphics\batik-svggen\1.14\batik-svggen-1.14.jar;C:\Users\k017253\.m2\repository\org\apache\xmlbeans\xmlbeans\5.1.1\xmlbeans-5.1.1.jar;C:\Users\k017253\.m2\repository\org\apache\poi\ooxml-schemas\1.4\ooxml-schemas-1.4.jar;C:\Users\k017253\.m2\repository\com\itextpdf\itextpdf\5.5.0\itextpdf-5.5.0.jar;C:\Users\k017253\.m2\repository\com\sun\xml\ws\jaxws-ri\2.3.3\jaxws-ri-2.3.3.pom;C:\Users\k017253\.m2\repository\com\sun\xml\ws\jaxws-rt\2.3.3\jaxws-rt-2.3.3.jar;C:\Users\k017253\.m2\repository\com\sun\xml\ws\policy\2.7.10\policy-2.7.10.jar;C:\Users\k017253\.m2\repository\com\sun\xml\bind\jaxb-impl\2.3.3\jaxb-impl-2.3.3.jar;C:\Users\k017253\.m2\repository\org\glassfish\ha\ha-api\3.1.12\ha-api-3.1.12.jar;C:\Users\k017253\.m2\repository\org\glassfish\external\management-api\3.2.2\management-api-3.2.2.jar;C:\Users\k017253\.m2\repository\org\glassfish\gmbal\gmbal\4.0.1\gmbal-4.0.1.jar;C:\Users\k017253\.m2\repository\org\glassfish\pfl\pfl-tf\4.1.0\pfl-tf-4.1.0.jar;C:\Users\k017253\.m2\repository\org\glassfish\pfl\pfl-basic\4.1.0\pfl-basic-4.1.0.jar;C:\Users\k017253\.m2\repository\org\jvnet\staxex\stax-ex\1.8.3\stax-ex-1.8.3.jar;C:\Users\k017253\.m2\repository\com\sun\xml\stream\buffer\streambuffer\1.5.9\streambuffer-1.5.9.jar;C:\Users\k017253\.m2\repository\org\jvnet\mimepull\mimepull\1.9.13\mimepull-1.9.13.jar;C:\Users\k017253\.m2\repository\com\sun\xml\fastinfoset\FastInfoset\1.2.18\FastInfoset-1.2.18.jar;C:\Users\k017253\.m2\repository\com\sun\xml\ws\jaxws-tools\2.3.3\jaxws-tools-2.3.3.jar;C:\Users\k017253\.m2\repository\com\sun\xml\bind\jaxb-xjc\2.3.3\jaxb-xjc-2.3.3.jar;C:\Users\k017253\.m2\repository\com\sun\xml\bind\jaxb-jxc\2.3.3\jaxb-jxc-2.3.3.jar;C:\Users\k017253\.m2\repository\com\sun\xml\ws\jaxws-eclipselink-plugin\2.3.3\jaxws-eclipselink-plugin-2.3.3.jar;C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.moxy\2.7.6\org.eclipse.persistence.moxy-2.7.6.jar;C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.core\2.7.6\org.eclipse.persistence.core-2.7.6.jar;C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.asm\2.7.6\org.eclipse.persistence.asm-2.7.6.jar;C:\Users\k017253\.m2\repository\com\sun\xml\ws\sdo-eclipselink-plugin\2.3.3\sdo-eclipselink-plugin-2.3.3.jar;C:\Users\k017253\.m2\repository\org\eclipse\persistence\org.eclipse.persistence.sdo\2.7.6\org.eclipse.persistence.sdo-2.7.6.jar;C:\Users\k017253\.m2\repository\org\eclipse\persistence\commonj.sdo\2.1.1\commonj.sdo-2.1.1.jar;C:\Users\k017253\.m2\repository\com\sun\xml\ws\release-documentation\2.3.3\release-documentation-2.3.3-docbook.zip;C:\Users\k017253\.m2\repository\com\sun\xml\ws\samples\2.3.3\samples-2.3.3.zip;C:\Users\k017253\.m2\repository\jakarta\xml\ws\jakarta.xml.ws-api\2.3.3\jakarta.xml.ws-api-2.3.3.jar;C:\Users\k017253\.m2\repository\jakarta\xml\soap\jakarta.xml.soap-api\1.4.2\jakarta.xml.soap-api-1.4.2.jar;C:\Users\k017253\.m2\repository\jakarta\jws\jakarta.jws-api\2.1.0\jakarta.jws-api-2.1.0.jar;C:\Users\k017253\.m2\repository\jakarta\annotation\jakarta.annotation-api\1.3.5\jakarta.annotation-api-1.3.5.jar;C:\Users\k017253\.m2\repository\org\mockito\mockito-core\3.6.28\mockito-core-3.6.28.jar;C:\Users\k017253\.m2\repository\net\bytebuddy\byte-buddy\1.10.20\byte-buddy-1.10.20.jar;C:\Users\k017253\.m2\repository\net\bytebuddy\byte-buddy-agent\1.10.20\byte-buddy-agent-1.10.20.jar;C:\Users\k017253\.m2\repository\org\objenesis\objenesis\3.1\objenesis-3.1.jar;C:\Users\k017253\.m2\repository\net\javacrumbs\shedlock\shedlock-spring\4.44.0\shedlock-spring-4.44.0.jar;C:\Users\k017253\.m2\repository\net\javacrumbs\shedlock\shedlock-core\4.44.0\shedlock-core-4.44.0.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-context\5.3.4\spring-context-5.3.4.jar;C:\Users\k017253\.m2\repository\net\javacrumbs\shedlock\shedlock-provider-jdbc-template\4.44.0\shedlock-provider-jdbc-template-4.44.0.jar;C:\Users\k017253\.m2\repository\org\springframework\spring-jdbc\5.3.4\spring-jdbc-5.3.4.jar;C:\Users\k017253\.m2\repository\com\github\ben-manes\caffeine\caffeine\3.1.8\caffeine-3.1.8.jar;C:\Users\k017253\.m2\repository\com\google\errorprone\error_prone_annotations\2.21.1\error_prone_annotations-2.21.1.jar;C:\Users\k017253\.m2\repository\org\projectlombok\lombok\1.18.28\lombok-1.18.28.jar; -sourcepath C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java;C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\generated-sources\annotations; C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgulaKIKResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SorgulananBorcBilgi.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\cache\EftBankaSubeServiceResponseCache.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\HakedisRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\KurTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BorcBilgiArsivDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\VergiKimlikNo.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\HataMesaji.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturWS.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ReferansServisAdresService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\Banka.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\SgkBorcIslemleriJob.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\TahakkukDetay.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\KurPikur.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\TahakkukDetayConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\Kur.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SubeBazindaHakedisDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\TbBorcOdemeDetayDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDairesiBorcDetayi.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\CreateTahakkukPaketDetayForDosyaUploadRequestDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\EpostaGonderimService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ReferansKodBilgi.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\MektupController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ReferansServisAdres.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\BostakiTahakkukDetayConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\EftSaosBilgiPikur.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\AnlikBorcListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgulaDiger.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftBankaMSListResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\MuhasebeClientServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\IDisServiceIsletimService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SgkEftGunlukParametre.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\KisiTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukPaketiDosyasiDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\ZbFirmaSgkTahsilatYapDto.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\cache\KurServiceResponseCache.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\OgmdfifApplication.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\GibBorcSorgulaTalebiSonucAsenkron.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\base\BaseAbstractConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\dto\MesajArsivDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\FisTaslak.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\TbBorcOdemeListesiDetayDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDairesiBorcDetayi23A.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\KurClientServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\GetHataKodlariResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\IhracatciIslemleriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\PikurConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\BaglantiliBilgiMevcutException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SoyutMiktarDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\EftSube.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\GibBorcSorgu.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\HesapOnlemKod.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\dto\GelenMesajArsivDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SorgulananBorcBilgiListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Tahakkuk.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ItemSender.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\SchedulerConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\HareketTaslak.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\ExportedFile.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ReferansDegiskenBilgiRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SorgulananBorcBilgiTahakkuk.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\ServisRequestDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\FirmaSGKTahsilatYapCevapDetayObject.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\BorcBilgiService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\GidenMesajDurumTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\BorcBilgiRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ReferansKodBilgiDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\GibSorgulananBorcBilgiDetayService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\GibBorcSorguService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\Paket.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\AnlikBorcOdemeDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\UlkeTaslak.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\LetterItemDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\EftBilgiYonetimArsiv.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\specs\GenericSpecification.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\KararIslemleriController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\YapilmisOdemeDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\ErrorResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\ProcessRegistry.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\TahakkukDosyaYuklenmeDurum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\ZiraatBankasiService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\IhracatciBirlikRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\LetterJobTxService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\jobs\TypedJobs.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\LetterNotificationLogRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\BaseResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\GibBorcIslemleriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\TahakkukServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\MesajTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\TahakkukKarar.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\FileProcessingUtil.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturSorgu23AOutput.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\AnlikBorcDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ReferansKodBilgiRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\AttachmentDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\KararDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\enums\Crud.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ActionResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\EftBilgisiYonetimRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterRequestConverterService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukPaketiDosyasiRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\WebServiceLogRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\CevapVermeyenVergiDairesi.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukKararDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\ProvizyonTalepDurumConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukDetayRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ReferansKodBilgiController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\ZiraatBankasiServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturKaydetOutput.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\EbimRequest.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\IhracatciBirlikServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ItemBildirimHandler.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\KararRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgula.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\AsyncConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\KurIslemleriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\YapilmisOdemeTurEnumConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonListelemeDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\KasMesajResponseMessage.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\TahakkukDosyasiKararTipiEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Provizyon.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\EmirDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\AnlikBorc.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\handler\LetterHandlerFactory.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\SorgulananBorcDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\YetkiException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\BorcAlacakTurKod.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\TahakkukListesiDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\TicaretBakanligiServiceClientImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\DilekceBorcuYokturKaydetIslemi.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\api\LogAudit.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\HakedisDevirDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BorcBilgiListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\EPostaResponseMessage.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\Borclar.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\TahakkukPaket.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgulaResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\ServisTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\ProvizyonTalepConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LogAuditService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\TahakkukListesi.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\HakedisDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\EftBilgiYonetimProjection.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\GibServiceClientImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\IhracatciTakipHesapServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\annotations\AuditAll.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\TahakkukKaynakEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\IhracatciTakipHesapConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BostakiTahakkukDetayListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\FaturaBilgiPikur.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\DeleteTahakkukPaketDetayRequestDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\KurIslemleriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkTahsilatKaydetResult.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\EftBilgiYonetimService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\EftBanka.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\BankaServiceRestUrls.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TalepOzetHandler.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\EmirListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukDetayDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\OdemeDetayDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\DynamicJobRegistry.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\ValidatorUtil.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDaireleri.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ProvizyonTalepIslemleriController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftMesajSorgulama.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ReferansDegiskenBilgiDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\EbimTaslak.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\OrtakMuhasebeRequestIdGenerator.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\TurkishCharacterUtil.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ApiGenericResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonArsivListelemeDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftBankaMSResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\BorcTipEnumConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\MektupTipEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgulaKIK.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Emir.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\dto\BorcTahsilatDto.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\MuhasebeIslemOzet.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\YapilmisOdemelerController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\DbUtilConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\BakiyeBilgiTaslak.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\WebConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\LetterStatusEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\rest\RestStatusCodeException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\MuhasebeIslemRequest.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\GecersizVeriException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\DateUtils.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\MesajDurumKodlari.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SgkEftGunlukParametreServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\BorcIslemleriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\KisiTaslak.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ReferansMailAdresDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterAttempt.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonIdProjection.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\GenericResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ReferansServisAdresServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\IIdempotencyService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturSorguDigerOutput.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SubeProvizyonListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\SgkServiceRestUrls.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SorgulananBorcBilgiService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterRequestTransactionService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\rest\RestAuthorizationException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\OdemeSekliEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\TahakkukSatiri.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\BostakiTahakkukDetay.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftGenericResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\SgkClientServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\GibSorgulananBorcBilgiDetayServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SorgulananBorcBilgiTahakkukRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\HareketTaslakWithRequestId.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SgkBorcSorguService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BostakiTahakkukDetayDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\HareketTaslakPikur.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\OnOffKod.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\TicaretBakanligiServiceClient.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftSubeMSResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TahakkukService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\HataBildirimHandler.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ApiServiceResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\TahakkukIslemleriController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\IslemOzetRequest.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SorgulananBorcBilgiTahakkukServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterItemConverterService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\OrtakMektupIslemlerService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\TahakkukConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\OdemeMantiksalGrupDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SubeProvizyonDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\SehirEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\EftBilgiYonetim.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\KararIslemleriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\enums\FisIslemTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ProvizyonTalepRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\GibBorcSorgulaSonucAsenkron.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\WebServiceLog.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\AnlikBorcRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\SubeTaslak.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\interceptor\AuditInterceptor.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ManuelTahakkukPaketiEkleRequestDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\Borc.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterNotificationLogConverterService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\OdemeMantiksalGrupServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\PlatformWebConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterNotificationLog.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\OdemeMantiksalGrup.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\OrtakBorcIslemleriUygulaJob.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\rest\RestServiceNotFoundException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\MuhasebeOnaySureciEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\ProvizyonOnayDurum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonArsivIdProjection.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\FirmaSGKBorcSorguCevapDetayObject.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\Ihracatci.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ApigwMSCallerService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDaireleriResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\KesintiAlinisTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\BorcBilgiArsivConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SgkBorcIslemleriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SgkMutabakatRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ReferansMailAdres.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\YapilmisOdemeService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\HakedisDevirRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\EFTClientService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\GenelRuntimeException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\TbBorcOdemeDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TahakkukIslemleriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\YedekConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\BaseEntityImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\LetterRequestDto.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\GibBorcSorguRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\KararOnay.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\MailContext.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\MutabakatBilgi.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MektupService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\ObjectFactory.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SubeProvizyonIslemleriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\AnlikBorcSorguDurumEnumConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\DuzenleyenTipiEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonArsivProjectionExtended.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonDosyaOdemeRequestDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SorgulananBorcBilgiTahakkukYedekRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\KurTipiEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TahakkukPaketiDosyasiService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\BaseResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\LogAuditServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterRequestId.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SgkBorcSorgu.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ReferansMailAdresServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\DisServisIsletimJob.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MailFacadeImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\AnlikBorcService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\IhracatciOdemeDurumuEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\PikurDonusumServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\BorcBilgiProjection.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\GelenMesajDurumTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ReferansServisAdresController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonTalepDetayDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\ValorluTransferBilgiPikur.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Audit.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\RestUrlHolder.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SorgulananBorcBilgiTahakkukService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\KurumTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkTalepSorguBorc.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ParaDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\dto\DuzenlenenMesajDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\IhracatciBirlikService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\WebClientCallException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\BankaClientService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\HesapKarakterKod.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\HakedisDevirConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\BorcBilgiArsivProjection.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\EbimTaslakPikur.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ReferansMailAdresService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\HesapBilgisiUyumsuzException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\KurClientServiceRestUrls.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\LetterProcessingJob.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\annotations\AuditSelect.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ReferansMailAdresRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\IhracatciRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukDosyasiUploadRequestDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\HakedisDevir.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\IhracatciIslemDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\IhracatciListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukDosyaYuklenmeDurumRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\UserController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\UpdateHakedisBakiyeDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\EpostaServiceMailClient.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\rest\HttpUtils.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\model\response\BaseResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\BorcBilgiServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\AnlikBorcDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\AnlikBorcController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\event\SharedDataEvent.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\HesapNo.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\UniqueProvizyonEbimDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\KararTipiEnumConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\BankaClientServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ProvizyonTalepService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\TahakkukIslemResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\CreateManuelTahakkukPaketDetayRequestDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SorgulananBorcBilgiDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\OrtakMektupIslemlerServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Karar.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukBorcDetayRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ProvizyonTalepArsivRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\YapilmisOdemeTurEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\SaosClientServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SgkBorcSorguServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\WebServiceLogService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkTalepSorguBorcDetay.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterRequestConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\AnlikBorcConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SubeProvizyonIslemleriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ProvizyonIslemleriController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterRequest.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SorgulananBorcBilgiYedekRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\GenelException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\StringUtil.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ProvizyonTalepOdemeServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\LetterAttemptRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\referans\ReferansMailAdresiKaydiMevcutException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\SwaggerConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\EftOdemeMediatorDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SorgulananBorcBilgiTahakkukYedek.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\GibBorcSorgulaSonucDetayAsenkron.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ReferansDegiskenBilgi.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\IhracatciTakipHesapController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\OnayDurum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ReferansDegiskenBilgiController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\RestConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\BorcIslemEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\base\DtoConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Ihracatci.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\BorcBilgiArsiv.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\KararListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TahakkukKararService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ProvizyonIslemleriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterItemConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\IhracatciBirlikDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterNotificationLogConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\KararOnayRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ReferansDegiskenBilgiServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\GenericMSCallerService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgula22AResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\PikurDonusumService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ReferansServisAdresDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\EmirIslemleriRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\servisDto\ParaBirimiDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgula23AResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\BorcBilgiConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\MailTypeEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\AnlikBorcIslemleriJob.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\BorcBilgiArsivRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ProvizyonIslemleriRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\TahakkukDosyaYuklenmeDurumService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ProvizyonOdemeRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\HesapController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\SaosClientService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\referans\ReferansDegiskenBilgiKaydiMevcutException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\OptionDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturSorguKIKOutput.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\SgkClientService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\base\BaseConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\PageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BostakiDetayAtaDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\dto\PikurData.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\BostakiTahakkukDetayService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\Attachment.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\enums\EmirDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\SorgulananBorcBilgiConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\IhracatciConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\EftServiceRestUrls.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\TahakkukDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\ZiraatBankasiResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\BankaSubeServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\KararTipiEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftBaseResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\MektupServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\KararConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkMutabakatResult.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\base\EntityConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\TahsilatKaydetSonucDto.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDairesiBorcDetayiKIK.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SgkMSCallerService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturWS_Service.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\ZbFirmaSgkBorcOkuDto.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\YapilmisOdemeListPageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ProvizyonTalepServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\HakedisIslemDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\HakedisDevirListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\TCKimlikNo.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SubeAnlikBorcSorgulaDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonArsivDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\HakedisIslemleriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonProjectionExtended.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\ValidationException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukSubeIliskilendirDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\LetterItemRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDairesiBorcDetayi22A.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\SearchOperationEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BaseDTOImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\cache\SubeKoduServiceResponseCache.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\GibBorcSorguServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MailService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\ParaTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\BostakiTahakkukDetayRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\servisDto\MuhasebeBilgiDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\IhracatciBirlik.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MailHandler.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\rest\RestUtils.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\EmirIslemleriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\enums\MuhasebeHataKodEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukDetayListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonTalepDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\FisTaslakPikur.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\IBAN.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\ScopeTypeEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\ProvizyonArsivConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\annotations\AuditDelete.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\PikurTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonProjection.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ortakmuhasebe\enums\MuhasebeDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\ProvizyonTalepDurum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\KesintiTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\BaseController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\ProvizyonConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\AnlikBorcHesapTaslakDto.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\EPostaDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\ZiraatBankasiIslemleriJob.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\pikur\DetayPikur.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\DilekceSorguInput.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ReferansDegiskenBilgiService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\fileProcessing\FileProcessDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SgkEftGunlukParametreService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\IhracatciBirlikConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ProvizyonOdeme.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\BorcBilgiController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\GibServiceClient.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\ServisTaslak.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SorgulananBorcBilgiYedek.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\GibBorcIslemleriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SorgulananBorcBilgiRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\TahakkukPaketiDosyasiServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonDosyaTalepDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\EmirConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\KullaniciBilgileriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgulaDigerResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\PathKeyEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\HakedisDevirIslemYonuEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\SAMUtils.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\KullaniciBilgileriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\MektupTipiEnumConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\EpostaGonderimServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterNotificationLogService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\EmirIslemleriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\KurDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\SubeKoduEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\BaseResponseKasMesaj.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\EbimHareketDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\HakedisDevirDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterItem.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\JobsDetayEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\jobs\JobDefinition.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\TahakkukPaketiDosyasi.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\HakedisConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgula22A.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\TbTahakkukDuzenlemeDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\EFTClientServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\StandartBildirimHandler.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\Constants.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\TahakkukKararRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\dto\GidenMesajArsivDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ProvizyonArsivIslemleriRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\LetterItemTxService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\HakedisIslemleriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\IhracatciTakipHesapService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\TahakkukBorcDetay.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\GibSorgulananBorcBilgiDetay.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\ServisTakipNoTipEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\handler\GlobalExceptionHandler.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\GibBorcIslemleriJob.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\ObjectMapperConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\handler\OdemeMektupLetterHandler.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\event\LetterNotificationEventListener.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\IhracatciTakipHesapDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\AnlikBorcHesap.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ReferansKodBilgiService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ProvizyonTalepOdemeService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonTalepListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\marshallModel\TahakkukCetveli.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\BorcTipEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\GibSorgulananBorcBilgiDetayRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\referans\ReferansKodBilgiKaydiMevcutException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\YapilmisOdemeServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\event\LetterRequestCreatedEvent.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\BankaSubeService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\WebServiceLogServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\KararIslemleriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\DovizTipiEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\HakedisIslemleriController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\BorcSorgulaRequestAsenkron.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\SgkMutabakatRequestDto.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\WebClientConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\annotations\AuditUpdate.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\HesapTaslak.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\MailMessage.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonTalepIcmalDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\dto\MesajDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\MuhasebeController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\EmirDurumEnumConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDaireleriOutput.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\TicaretTahakkukResponseIslem.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\SecurityConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\LetterNotifyLogDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\SubeProvizyonIslemleriController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\IslemKod.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\IhracatciTakipHesapRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ProvizyonArsiv.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\DilekceBorcuYokturKaydetIslemiResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\audit\annotations\AuditInsert.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SgkBorcSorguRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\GetHataKodlari.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\ReferansServisAdresRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\IhracatciTakipHesapListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\OrtakMuhasebeClientService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\MuhasebeDurumEnumConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturSorguOutput.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\HesapService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\ProvizyonIslemleriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\EbimOnayEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\MuhasebeClientService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\CollectionDeserializer.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\UserLoginInfoDto.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\LogAuditRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\IhracatciIslemleriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ItemSenderFactory.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\OdemeMantiksalGrupService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\TahakkukDosyaYuklenmeDurumServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\ProvizyonOnayDurumConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\OdemeItemSender.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MailClient.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\HataliEftKontrolEtJob.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\IdempotencyService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\IhracatciIslemleriController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\ZbWebServiceUrls.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\DisServisIsletimServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\IhracatciTakipHesapIslemDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\AnlikBorcHesapRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\ReferansKodBilgiServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\TahakkukSatirDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\AdresTaslak.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\EftBilgisiYonetimServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\handler\TahakkukCetveliValidationHandler.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterItemId.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SgkBorcTahsilat.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\HesapTipEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\impl\OrtakMuhasebeClientServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\ModulUtil.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ProvizyonTalepArsiv.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\HakedisListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\ErrorModel.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturSorgu22AOutput.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\UniqueProvizyonTalepDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\MailServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\SgkEftGunlukParametreRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\SgkMutabakat.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\TahakkukPaketiDosyasiConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\EdsUtilConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\DevirIslemDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturKaydetInput.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\KararDurumEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\constant\IhracatciTipiEnum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\UnsupportedItemSender.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\SorgulananBorcBilgiServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\VergiDairesiBorcDetayiDiger.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\RestServiceHandler.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\LetterRequestListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\PikurResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\EftSubeMSListResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\TahakkukPaketResponse.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\PropertyReader.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\KurClientService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\specs\SearchCriteria.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\EbimHareketDurum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\util\SoyutMiktarStringConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\Adres.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\schedular\EmirIsletimJob.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\HesapServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\LetterRequestRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\MesajDurumTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\AnlikBorcServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\request\TahsilatKaydetRequestDto.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\BostakiTahakkukDetayServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterNotificationLogServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\rest\RestException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\client\ZiraatBankasiClient.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\BorcBilgiDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\enums\HareketKodu.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\ProvizyonTalep.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\SubeOdemeGroupDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\TahakkukIslemleriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\controller\ReferansMailAdresController.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\TahakkukPaketListDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\MailFacade.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\LetterRequestTransactionsServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\response\MesajIslemSonuc.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\Hakedis.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\HakedisDevirOlusturDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\handler\LetterHandler.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\EftBilgisiYonetimArsivRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\config\LogConfig.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\Durum.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\gib\BorcuYokturDilekceSorgula23A.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\converter\TahakkukDurumEnumConverter.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\orkestrator\saos\constant\SaosMesajTip.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\SgkBorcIslemleriService.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\TahakkukKararServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\BorcBilgi.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\repository\OdemeMantiksalGrupRepository.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\url\EpostaServiceRestUrls.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\exception\referans\ReferansServisAdresiKaydiMevcutException.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\LetterAttemptId.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\MektupTalepListePageDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\EftBilgiYonetimArsivProjection.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\ws\SingleDeserializer.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\entity\IhracatciTakipHesap.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\IhracatciDTO.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\projection\ProvizyonArsivProjection.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\service\impl\BorcIslemleriServiceImpl.java C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\src\main\java\tr\gov\tcmb\ogmdfif\model\dto\ProvizyonOdemeYapRequestDTO.java -s C:\Users\k017253\IdeaProjects\ogm\ogmdfifse\target\generated-sources\annotations -g -parameters -target 11 -source 11 -encoding UTF-8 -Xlint:unchecked -Xlint:deprecation
[DEBUG] incrementalBuildHelper#beforeRebuildExecution
[INFO] Compiling 675 source files with javac [forked debug target 11] to target\classes
[WARNING] Unable to autodetect 'javac' path, using 'javac' from the environment.
[DEBUG] incrementalBuildHelper#afterRebuildExecution
[INFO] ------------------------------------------------------------------------
[INFO] BUILD FAILURE
[INFO] ------------------------------------------------------------------------
[INFO] Total time:  2.129 s
[INFO] Finished at: 2025-08-26T07:43:11+03:00
[INFO] ------------------------------------------------------------------------
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile (default-compile) on project OGMDFIFSE: Compilation failure -> [Help 1]
org.apache.maven.lifecycle.LifecycleExecutionException: Failed to execute goal org.apache.maven.plugins:maven-compiler-plugin:3.11.0:compile (default-compile) on project OGMDFIFSE: Compilation failure
    at org.apache.maven.lifecycle.internal.MojoExecutor.execute (MojoExecutor.java:215)
    at org.apache.maven.lifecycle.internal.MojoExecutor.execute (MojoExecutor.java:156)
    at org.apache.maven.lifecycle.internal.MojoExecutor.execute (MojoExecutor.java:148)
    at org.apache.maven.lifecycle.internal.LifecycleModuleBuilder.buildProject (LifecycleModuleBuilder.java:117)
    at org.apache.maven.lifecycle.internal.LifecycleModuleBuilder.buildProject (LifecycleModuleBuilder.java:81)
    at org.apache.maven.lifecycle.internal.builder.singlethreaded.SingleThreadedBuilder.build (SingleThreadedBuilder.java:56)
    at org.apache.maven.lifecycle.internal.LifecycleStarter.execute (LifecycleStarter.java:128)
    at org.apache.maven.DefaultMaven.doExecute (DefaultMaven.java:305)
    at org.apache.maven.DefaultMaven.doExecute (DefaultMaven.java:192)
    at org.apache.maven.DefaultMaven.execute (DefaultMaven.java:105)
    at org.apache.maven.cli.MavenCli.execute (MavenCli.java:957)
    at org.apache.maven.cli.MavenCli.doMain (MavenCli.java:289)
    at org.apache.maven.cli.MavenCli.main (MavenCli.java:193)
    at jdk.internal.reflect.NativeMethodAccessorImpl.invoke0 (Native Method)
    at jdk.internal.reflect.NativeMethodAccessorImpl.invoke (NativeMethodAccessorImpl.java:62)
    at jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke (DelegatingMethodAccessorImpl.java:43)
    at java.lang.reflect.Method.invoke (Method.java:566)
    at org.codehaus.plexus.classworlds.launcher.Launcher.launchEnhanced (Launcher.java:282)
    at org.codehaus.plexus.classworlds.launcher.Launcher.launch (Launcher.java:225)
    at org.codehaus.plexus.classworlds.launcher.Launcher.mainWithExitCode (Launcher.java:406)
    at org.codehaus.plexus.classworlds.launcher.Launcher.main (Launcher.java:347)
    at org.codehaus.classworlds.Launcher.main (Launcher.java:47)
Caused by: org.apache.maven.plugin.compiler.CompilationFailureException: Compilation failure
    at org.apache.maven.plugin.compiler.AbstractCompilerMojo.execute (AbstractCompilerMojo.java:1214)
    at org.apache.maven.plugin.compiler.CompilerMojo.execute (CompilerMojo.java:193)
    at org.apache.maven.plugin.DefaultBuildPluginManager.executeMojo (DefaultBuildPluginManager.java:137)
    at org.apache.maven.lifecycle.internal.MojoExecutor.execute (MojoExecutor.java:210)
    at org.apache.maven.lifecycle.internal.MojoExecutor.execute (MojoExecutor.java:156)
    at org.apache.maven.lifecycle.internal.MojoExecutor.execute (MojoExecutor.java:148)
    at org.apache.maven.lifecycle.internal.LifecycleModuleBuilder.buildProject (LifecycleModuleBuilder.java:117)
    at org.apache.maven.lifecycle.internal.LifecycleModuleBuilder.buildProject (LifecycleModuleBuilder.java:81)
    at org.apache.maven.lifecycle.internal.builder.singlethreaded.SingleThreadedBuilder.build (SingleThreadedBuilder.java:56)
    at org.apache.maven.lifecycle.internal.LifecycleStarter.execute (LifecycleStarter.java:128)
    at org.apache.maven.DefaultMaven.doExecute (DefaultMaven.java:305)
    at org.apache.maven.DefaultMaven.doExecute (DefaultMaven.java:192)
    at org.apache.maven.DefaultMaven.execute (DefaultMaven.java:105)
    at org.apache.maven.cli.MavenCli.execute (MavenCli.java:957)
    at org.apache.maven.cli.MavenCli.doMain (MavenCli.java:289)
    at org.apache.maven.cli.MavenCli.main (MavenCli.java:193)
    at jdk.internal.reflect.NativeMethodAccessorImpl.invoke0 (Native Method)
    at jdk.internal.reflect.NativeMethodAccessorImpl.invoke (NativeMethodAccessorImpl.java:62)
    at jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke (DelegatingMethodAccessorImpl.java:43)
    at java.lang.reflect.Method.invoke (Method.java:566)
    at org.codehaus.plexus.classworlds.launcher.Launcher.launchEnhanced (Launcher.java:282)
    at org.codehaus.plexus.classworlds.launcher.Launcher.launch (Launcher.java:225)
    at org.codehaus.plexus.classworlds.launcher.Launcher.mainWithExitCode (Launcher.java:406)
    at org.codehaus.plexus.classworlds.launcher.Launcher.main (Launcher.java:347)
    at org.codehaus.classworlds.Launcher.main (Launcher.java:47)
[ERROR] 
[ERROR] 
[ERROR] For more information about the errors and possible solutions, please read the following articles:
[ERROR] [Help 1] http://cwiki.apache.org/confluence/display/MAVEN/MojoFailureException

Process finished with exit code 1






pom

<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>BIEPLTF</groupId>
        <artifactId>BIEPLTFMD-PARENT</artifactId>
        <version>1.0.0-3</version>
    </parent>
    <groupId>OGMDFIF</groupId>
    <artifactId>OGMDFIFSE</artifactId>
    <version>${versionNumber}</version>
    <name>OGMDFIFSE</name>
    <description>Destekleme ve Fiyat İstikrar Fonu</description>
    <!-- Artifact group, id and version -->
    <properties>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <project.reporting.outputEncoding>UTF-8</project.reporting.outputEncoding>
        <project.compiler.encoding>UTF-8</project.compiler.encoding>
        <versionNumber>0.0.1</versionNumber>
        <buildImage>biepltf/biepltfcm-buildimage/jdk11</buildImage>
        <!-- Required for aspecting. -->
    </properties>

    <!-- The dependencies required by this project -->
    <dependencies>
        <dependency> <!-- veri tabanı işlemleri için Spring Data -->
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency> <!-- hibernate validator -->
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.apache.pdfbox</groupId>
            <artifactId>pdfbox</artifactId>
            <version>2.0.22</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-mail</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency> <!-- Equals ve HashCode builder -->
            <groupId>org.apache.commons</groupId>
            <artifactId>commons-lang3</artifactId>
        </dependency>
        <dependency> <!-- Rest API geliştirmek için gerekli bir sözleşme standardı swagger -->
            <groupId>io.springfox</groupId>
            <artifactId>springfox-swagger2</artifactId>
            <version>2.9.2</version>
        </dependency>
        <dependency> <!-- İşlem yapan kullanıcı bilgisini almak için kullanıyoruz -->
            <groupId>BIEPLTF</groupId>
            <artifactId>BIEPLTFMD-SECURITY</artifactId>
            <version>1.0.0-18</version>
        </dependency>
        <dependency>
            <groupId>BIEPLTF</groupId>
            <artifactId>BIEPLTFMD-LOG</artifactId>
            <version>1.0.0-8</version>
        </dependency>
        <dependency>
            <groupId>BIEPLTF</groupId>
            <artifactId>BIEPLTFMD-DBUTIL243</artifactId>
            <version>1.0.0-3</version>
        </dependency>
        <dependency>
            <groupId>BIEPLTF</groupId> <!-- EDS login isteyen servislere erişim için hazırlanmış modüldür -->
            <artifactId>BIEPLTFMD-EDSUTIL</artifactId>
            <version>1.0.0-16</version>
        </dependency>
        <dependency>
            <groupId>BIEPLTF</groupId> <!-- EDS login isteyen servislere erişim için hazırlanmış modüldür -->
            <artifactId>BIEPLTFMD-REACTIVEEDSUTIL</artifactId>
            <version>1.0.0-5</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-webflux</artifactId>
        </dependency>
        <dependency> <!-- Audit iş kuralları -->
            <groupId>BIEPLTF</groupId>
            <artifactId>BIEPLTFMD-AUDIT</artifactId>
            <version>1.0.0-9</version>
        </dependency>
        <dependency> <!-- /platform/applicationInfo" ile uygulamaya ait özet bilgiyi dönen controllerı sunan modüldür-->
            <groupId>BIEPLTF</groupId>
            <artifactId>BIEPLTFMD-WEB</artifactId>
            <version>1.0.0-2</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-cache</artifactId>
        </dependency>

        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.junit.platform</groupId>
            <artifactId>junit-platform-runner</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-devtools</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>javax.mail</groupId>
            <artifactId>mail</artifactId>
            <version>1.4.7</version>
        </dependency>
        <dependency>
            <groupId>com.vaadin.external.google</groupId>
            <artifactId>android-json</artifactId>
            <version>0.0.20131108.vaadin1</version>
        </dependency>
        <dependency>
            <groupId>com.google.code.gson</groupId>
            <artifactId>gson</artifactId>
        </dependency>
        <dependency>
            <groupId>org.mockito</groupId>
            <artifactId>mockito-inline</artifactId>
            <version>3.8.0</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.apache.httpcomponents</groupId>
            <artifactId>httpclient</artifactId>
        </dependency>
        <dependency>
            <groupId>SUBMUHB</groupId>
            <artifactId>SUBMUHBMD-PIKUR</artifactId>
            <version>2.7.0-7</version>
        </dependency>
        <dependency>
            <groupId>tcmb.platform</groupId>
            <artifactId>xml</artifactId>
            <version>R2_9_0</version>
            <scope>provided</scope>
        </dependency>
        <dependency>
            <groupId>commons-logging</groupId>
            <artifactId>commons-logging</artifactId>
            <version>1.1</version>
        </dependency>
        <dependency>
            <groupId>com.fasterxml</groupId>
            <artifactId>jackson-module-hibernate</artifactId>
            <version>1.9.1</version>
            <exclusions>
                <exclusion>
                    <groupId>org.codehaus.jackson</groupId>
                    <artifactId>jackson-mapper-asl</artifactId>
                </exclusion>
                <exclusion>
                    <artifactId>jackson-core-asl</artifactId>
                    <groupId>org.codehaus.jackson</groupId>
                </exclusion>
            </exclusions>
        </dependency>

        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
            <version>2.13.4</version>
        </dependency>
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-core</artifactId>
            <version>2.13.4</version>
        </dependency>
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-annotations</artifactId>
            <version>2.13.4</version>
        </dependency>
        <dependency>
            <groupId>com.google.code.bean-matchers</groupId>
            <artifactId>bean-matchers</artifactId>
            <version>0.13</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>MGMOSYP</groupId>
            <artifactId>MGMOSYPMD-MODEL</artifactId>
            <version>1.3.0-16</version>
        </dependency>

        <dependency>
            <groupId>org.apache.poi</groupId>
            <artifactId>poi-ooxml</artifactId>
            <version>5.2.3</version>
        </dependency>
        <dependency>
            <groupId>org.docx4j</groupId>
            <artifactId>docx4j</artifactId>
            <version>6.1.2</version>
        </dependency>
        <dependency>
            <groupId>org.docx4j</groupId>
            <artifactId>docx4j-export-fo</artifactId>
            <version>6.1.0</version>
        </dependency>

        <dependency>
            <groupId>org.apache.xmlgraphics</groupId>
            <artifactId>fop</artifactId>
            <version>2.6</version>
        </dependency>
        <dependency>
            <groupId>org.apache.xmlbeans</groupId>
            <artifactId>xmlbeans</artifactId>
            <version>5.1.1</version>
        </dependency>

        <dependency>
            <groupId>org.apache.poi</groupId>
            <artifactId>ooxml-schemas</artifactId>
            <version>1.4</version>
        </dependency>





        <!-- https://mvnrepository.com/artifact/com.itextpdf/itextpdf -->
        <dependency>
            <groupId>com.itextpdf</groupId>
            <artifactId>itextpdf</artifactId>
            <version>5.5.0</version>
        </dependency>
        <dependency>
            <groupId>com.sun.xml.ws</groupId>
            <artifactId>jaxws-ri</artifactId>
            <version>2.3.3</version>
            <type>pom</type>
        </dependency>
        <dependency>
            <groupId>org.mockito</groupId>
            <artifactId>mockito-core</artifactId>
        </dependency>
        <dependency>
            <groupId>net.javacrumbs.shedlock</groupId>
            <artifactId>shedlock-spring</artifactId>
            <version>4.44.0</version>
        </dependency>
        <dependency>
            <groupId>net.javacrumbs.shedlock</groupId>
            <artifactId>shedlock-provider-jdbc-template</artifactId>
            <version>4.44.0</version>
        </dependency>
        <dependency>
            <groupId>com.github.ben-manes.caffeine</groupId>
            <artifactId>caffeine</artifactId>
            <version>3.1.8</version>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <version>1.18.28</version>
        </dependency>
    </dependencies>
    <build>
        <finalName>app</finalName>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
                <configuration>
                    <source>11</source>
                    <target>11</target>
                    <fork>true</fork>
                    <compilerArgs>
                        <arg>-Xlint:unchecked</arg>
                        <arg>-Xlint:deprecation</arg>
                    </compilerArgs>
                    <encoding>UTF-8</encoding>
                </configuration>
            </plugin>
        </plugins>
    </build>

    <profiles>
        <profile>
            <id>local.profile</id>
            <properties>
            </properties>
        </profile>
        <!-- This profiles for Bamboo Docker Builds! Do not change! -->
        <profile>
            <id>bamboo.profile</id>
            <properties>
                <!--suppress UnresolvedMavenProperty -->
                <versionNumber>${bambooVersionNumber}</versionNumber>
            </properties>
        </profile>
    </profiles>

</project>



///yyy
package tr.gov.tcmb.ogmdfif.service.handler;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;
import tr.gov.tcmb.ogmdfif.constant.*;
import tr.gov.tcmb.ogmdfif.model.dto.LetterRequestDto;
import tr.gov.tcmb.ogmdfif.model.entity.*;
import tr.gov.tcmb.ogmdfif.repository.EftBilgisiYonetimArsivRepository;
import tr.gov.tcmb.ogmdfif.repository.EftBilgisiYonetimRepository;
import tr.gov.tcmb.ogmdfif.repository.LetterRequestRepository;
import tr.gov.tcmb.ogmdfif.service.*;
import tr.gov.tcmb.ogmdfif.service.impl.LetterJobTxService;
import tr.gov.tcmb.submuhm.pikur.model.veri.DocGrupVeri;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.Executor;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * JUnit4 + SpringRunner + @SpringBootTest
 * Yalnızca kullanıcı mesajındaki metotları kapsar.
 */
@RunWith(SpringRunner.class)
@SpringBootTest
public class OdemeMektupLetterHandlerSpringTest {

    // SUT
    @SpyBean
    private OdemeMektupLetterHandler handler;

    // ---- bağımlılıklar (Spring’e @MockBean) ----
    @MockBean private ProvizyonIslemleriService provizyonIslemleriService;
    @MockBean private KararIslemleriService kararIslemleriService;
    @MockBean private OrtakMektupIslemlerService ortakMektupIslemlerService;
    @MockBean private EFTClientService eftClientService;
    @MockBean private EftBilgisiYonetimArsivRepository eftBilgisiYonetimArsivRepository;
    @MockBean private ProvizyonArsivIslemleriRepository provizyonArsivIslemleriRepository;
    @MockBean private BorcBilgiService borcBilgiService;
    @MockBean private PikurIslemService pikurIslemService;
    @MockBean private BankaSubeService bankaSubeService;
    @MockBean private EftBilgisiYonetimRepository eftBilgisiYonetimRepository;
    @MockBean private LetterRequestRepository letterRequestRepo;
    @MockBean private org.springframework.context.ApplicationEventPublisher eventPublisher;
    @MockBean private LetterRequestConverterService letterRequestConverter;
    @MockBean private LetterJobTxService jobTxService;
    @MockBean private LetterItemConverterService letterItemConverter;
    @MockBean private KullaniciBilgileriService kullaniciBilgileriService;
    @MockBean private LetterRequestTransactionService letterRequestTransactionService;
    @MockBean private LetterNotificationLogConverterService letterNotificationLogConverterService;
    @MockBean private LetterNotificationLogService letterNotificationLogService;
    @MockBean private MailFacade mailFacade;

    @MockBean(name = "letterReqExecutor")
    private Executor letterReqExecutor;

    private OdemeMektupLetterHandler target; // AOP proxy hedefi (tx açmamak için)

    @Before
    public void setUp() {
        // Proxy’yi by-pass edebilmek için hedef objeyi al
        target = AopTestUtils.getTargetObject(handler);

        // @Value alanlarını set et
        ReflectionTestUtils.setField(handler, "perTaskTimeoutMs", 3000L);
        ReflectionTestUtils.setField(handler, "globalTimeoutMs", 10000L);

        // Executor’u senkron çalıştır
        doAnswer(inv -> { ((Runnable)inv.getArgument(0)).run(); return null; })
                .when(letterReqExecutor).execute(any(Runnable.class));
    }

    // ---------------- handleInitialLetterRequestTransaction ----------------

    @Test
    public void handleInitial_mapsDto_andDelegatesTo_handleRequest() throws Exception {
        LocalDate first = LocalDate.of(2025, 8, 24);
        LocalDate last  = LocalDate.of(2025, 8, 25);
        UUID expected = UUID.randomUUID();

        when(kullaniciBilgileriService.getKullaniciSubeId()).thenReturn("SUBE-42");

        try (MockedStatic<SAMUtils> mocked = Mockito.mockStatic(SAMUtils.class)) {
            mocked.when(SAMUtils::getSimdikiKullaniciSicili).thenReturn("SICIL-7");

            ArgumentCaptor<LetterRequestDto> dtoCap = ArgumentCaptor.forClass(LetterRequestDto.class);
            doReturn(expected).when(handler).handleRequest(dtoCap.capture(), eq("SICIL-7"), eq("SUBE-42"));

            UUID out = handler.handleInitialLetterRequestTransaction(
                    KararTipiEnum.TARIMSAL, 99, 2025, "K-123",
                    first, last, "VKN123", null,
                    MektupTipEnum.ODEME_MEKTUPLARI
            );

            assertEquals(expected, out);
            LetterRequestDto dto = dtoCap.getValue();
            assertEquals(String.valueOf(MektupTipEnum.convertMektupTipToRequestTypeId(MektupTipEnum.ODEME_MEKTUPLARI)), dto.getRequestTypeId());
            assertEquals(first.toString(), dto.getFirstPaymentDate());
            assertEquals(last.toString(), dto.getLastPaymentDate());
            assertEquals(KararTipiEnum.TARIMSAL.name(), dto.getTahakkukTuru());
            assertEquals("99", dto.getBelgeNo());
            assertEquals("2025", dto.getYil());
            assertEquals("K-123", dto.getKararNoAdi());
            assertEquals("VKN123", dto.getVkn());
            assertNull(dto.getTckn());
            assertEquals("VKN123", dto.getScopeValue());
        }
    }

    // ---------------- odemeMektupDetayBorcHazirlaArsiv (private) ----------------

    @Test
    public void odemeMektupDetayBorcHazirlaArsiv_buildsGroup_ok() throws Exception {
        EftBilgiYonetimArsiv a = new EftBilgiYonetimArsiv();
        a.setKasTarih("01/01/2025");

        DocGrupVeri grp = ReflectionTestUtils.invokeMethod(target,
                "odemeMektupDetayBorcHazirlaArsiv", a);

        assertNotNull(grp);
        assertEquals("BORCBILGILERI", grp.getGrupAd());
    }

    // ---------------- getOdemeMektupBorcBilgileri(ProvizyonArsiv, ...) ----------------

    @Test
    public void getOdemeMektupBorcBilgileri_arsiv_filtersKasTarih_andMaps() {
        ProvizyonArsiv p = new ProvizyonArsiv();
        p.setId(10L);

        EftBilgiYonetimArsiv e1 = new EftBilgiYonetimArsiv(); e1.setKasTarih("01/01/2025");
        EftBilgiYonetimArsiv e2 = new EftBilgiYonetimArsiv(); e2.setKasTarih(null);

        when(eftBilgisiYonetimArsivRepository.getEftBilgiYonetimArsivsByProvizyonId(10L))
                .thenReturn(Arrays.asList(e1, e2));

        List<DocGrupVeri> out = target.getOdemeMektupBorcBilgileri(p, false);
        assertEquals(1, out.size());
        assertEquals("BORCBILGILERI", out.get(0).getGrupAd());
    }

    // ---------------- odemeMektupDetayBorcHazirla (private) ----------------

    @Test
    public void odemeMektupDetayBorcHazirla_buildsGroup_forSgk_andNonSgk() throws Exception {
        // SGK kolu
        EftBilgiYonetim eSgk = new EftBilgiYonetim();
        eSgk.setKasTarih("01/01/2025");
        BorcBilgi b = new BorcBilgi();
        b.setBorcTipi(BorcTipEnum.SGK.getKod());
        b.setAliciAdi("SGK");
        b.setTutar(new BigDecimal("123.45"));
        eSgk.setBorcBilgi(b);

        DocGrupVeri g1 = ReflectionTestUtils.invokeMethod(target, "odemeMektupDetayBorcHazirla", eSgk);
        assertEquals("BORCBILGILERI", g1.getGrupAd());

        // SGK olmayan kol
        EftBilgiYonetim eOther = new EftBilgiYonetim();
        eOther.setKasTarih("02/01/2025");
        DocGrupVeri g2 = ReflectionTestUtils.invokeMethod(target, "odemeMektupDetayBorcHazirla", eOther);
        assertEquals("BORCBILGILERI", g2.getGrupAd());
    }

    // ---------------- getOdemeMektupBorcBilgileri(Provizyon, ...) ----------------

    @Test
    public void getOdemeMektupBorcBilgileri_normal_filtersKasTarih_andMaps() {
        Provizyon p = new Provizyon(); p.setId(9L);

        EftBilgiYonetim e1 = new EftBilgiYonetim(); e1.setKasTarih("01/01/2025");
        EftBilgiYonetim e2 = new EftBilgiYonetim(); e2.setKasTarih(null);

        when(eftBilgisiYonetimRepository.getEftBilgiYonetimsByProvizyonId(9L))
                .thenReturn(Arrays.asList(e1, e2));

        List<DocGrupVeri> out = target.getOdemeMektupBorcBilgileri(p, false);
        assertEquals(1, out.size());
        assertEquals("BORCBILGILERI", out.get(0).getGrupAd());
    }

    // ---------------- getProvizyonArsivToplamTutar ----------------

    @Test
    public void getProvizyonArsivToplamTutar_sums_whenKasTarihPresent() {
        ProvizyonArsiv p = new ProvizyonArsiv(); p.setId(7L);

        EftBilgiYonetimArsiv y1 = new EftBilgiYonetimArsiv();
        y1.setKasTarih("01/01/2025");
        y1.setTutar(new BigDecimal("10"));
        BorcBilgiArsiv bb1 = new BorcBilgiArsiv(); bb1.setId(100L);
        y1.setBorcBilgiArsiv(bb1);

        EftBilgiYonetimArsiv y2 = new EftBilgiYonetimArsiv();
        y2.setKasTarih("01/01/2025");
        y2.setTutar(new BigDecimal("5"));
        BorcBilgiArsiv bb2 = new BorcBilgiArsiv(); bb2.setId(200L);
        y2.setBorcBilgiArsiv(bb2);

        when(eftBilgisiYonetimArsivRepository.getEftBilgiYonetimArsivsByProvizyonId(7L))
                .thenReturn(Arrays.asList(y1, y2));
        when(borcBilgiService.getBorcBilgiArsivList(p)).thenReturn(Arrays.asList(bb1, bb2));

        BigDecimal sum = target.getProvizyonArsivToplamTutar(p, false);
        assertEquals(new BigDecimal("15"), sum);
    }

    // ---------------- getOdemeMektupDetayByProvizyon(ProvizyonArsiv) ----------------

    @Test
    public void getOdemeMektupDetayByProvizyon_arsiv_includesDetay_andBorc() {
        ProvizyonArsiv p = new ProvizyonArsiv();
        p.setId(5L);

        Ihracatci ihr = new Ihracatci();
        ihr.setAd("ACME");
        ihr.setAdres("Adres kisa.");
        p.setIhracatci(ihr);

        Karar k = new Karar();
        k.setKararNo("K-1");
        k.setAd("Karar Adı");
        k.setSubeId(10);
        k.setTip((short)1);
        p.setKarar(k);

        p.setOdemeTarih(new Date());

        EftBilgiYonetimArsiv y = new EftBilgiYonetimArsiv(); y.setKasTarih("01/01/2025");
        when(eftBilgisiYonetimArsivRepository.getEftBilgiYonetimArsivsByProvizyonId(5L))
                .thenReturn(Collections.singletonList(y));

        // toplam tutar için
        EftBilgiYonetimArsiv ySum = new EftBilgiYonetimArsiv();
        ySum.setKasTarih("01/01/2025");
        ySum.setTutar(new BigDecimal("20"));
        BorcBilgiArsiv bb = new BorcBilgiArsiv(); bb.setId(300L);
        ySum.setBorcBilgiArsiv(bb);
        when(eftBilgisiYonetimArsivRepository.getEftBilgiYonetimArsivsByProvizyonId(5L))
                .thenReturn(Arrays.asList(y, ySum));
        when(borcBilgiService.getBorcBilgiArsivList(p)).thenReturn(Collections.singletonList(bb));

        List<DocGrupVeri> out = target.getOdemeMektupDetayByProvizyon(p);
        assertFalse(out.isEmpty());
        assertEquals("DETAY", out.get(0).getGrupAd());
        assertTrue(out.stream().anyMatch(g -> "BORCBILGILERI".equals(g.getGrupAd())));
    }

    // ---------------- getOdemeMektupDetayByProvizyon(Provizyon) ----------------

    @Test
    public void getOdemeMektupDetayByProvizyon_normal_includesDetay_andBorc() {
        Provizyon p = new Provizyon();
        p.setId(4L);

        Ihracatci ihr = new Ihracatci();
        ihr.setAd("BETA");
        ihr.setAdres("Kisa adres");
        ihr.setEmail("mail@beta.com");
        p.setIhracatci(ihr);

        Karar k = new Karar();
        k.setKararNo("K-9");
        k.setAd("Karar");
        k.setSubeId(20);
        k.setTip((short)1);
        p.setKarar(k);

        p.setOdemeTarih(new Date());
        p.setTutar(new BigDecimal("77"));

        EftBilgiYonetim e = new EftBilgiYonetim(); e.setKasTarih("01/01/2025");
        when(eftBilgisiYonetimRepository.getEftBilgiYonetimsByProvizyonId(4L))
                .thenReturn(Collections.singletonList(e));

        List<DocGrupVeri> out = target.getOdemeMektupDetayByProvizyon(p);
        assertFalse(out.isEmpty());
        assertEquals("DETAY", out.get(0).getGrupAd());
        assertTrue(out.stream().anyMatch(g -> "BORCBILGILERI".equals(g.getGrupAd())));
    }

    // ---------------- validators ----------------

    @Test
    public void isValidProvizyonAndBorcBilgi_true_whenAllPresent() throws Exception {
        Provizyon p = new Provizyon();
        Ihracatci i = new Ihracatci(); i.setEmail("x@y.z");
        p.setIhracatci(i);
        List<BorcBilgi> list = Collections.singletonList(new BorcBilgi());

        boolean ok = ReflectionTestUtils.invokeMethod(target, "isValidProvizyonAndBorcBilgi", p, list);
        assertTrue(ok);
    }

    @Test
    public void isValidProvizyonAndBorcBilgi_false_whenMissing() throws Exception {
        Provizyon p = new Provizyon(); // ihracatci null
        boolean ok = ReflectionTestUtils.invokeMethod(target, "isValidProvizyonAndBorcBilgi", p, Collections.emptyList());
        assertFalse(ok);
    }

    @Test
    public void isValidProvizyonArsivAndBorcBilgiArsiv_true_whenAllPresent() throws Exception {
        ProvizyonArsiv p = new ProvizyonArsiv();
        Ihracatci i = new Ihracatci(); i.setEmail("a@b.c");
        p.setIhracatci(i);
        List<BorcBilgiArsiv> list = Collections.singletonList(new BorcBilgiArsiv());

        boolean ok = ReflectionTestUtils.invokeMethod(target, "isValidProvizyonArsivAndBorcBilgiArsiv", p, list);
        assertTrue(ok);
    }

    @Test
    public void isValidProvizyonArsivAndBorcBilgiArsiv_false_whenMissing() throws Exception {
        ProvizyonArsiv p = new ProvizyonArsiv();
        boolean ok = ReflectionTestUtils.invokeMethod(target, "isValidProvizyonArsivAndBorcBilgiArsiv", p, Collections.emptyList());
        assertFalse(ok);
    }
}

  
  
  
  ///seeeee
  @Override
    public UUID handleInitialLetterRequestTransaction(KararTipiEnum belgeTip,
                                                      Integer belgeNo,
                                                      Integer belgeYil,
                                                      String kararNo,
                                                      LocalDate ilkOdemeTarih,
                                                      LocalDate sonOdemeTarih,
                                                      String vkn,
                                                      String tckn,
                                                      MektupTipEnum mektupTip) throws Exception {
        LetterRequestDto dto = new LetterRequestDto();
        dto.setRequestTypeId(String.valueOf(MektupTipEnum.convertMektupTipToRequestTypeId(mektupTip)));
        dto.setFirstPaymentDate(String.valueOf(ilkOdemeTarih));
        dto.setLastPaymentDate(String.valueOf(sonOdemeTarih));
        dto.setTahakkukTuru(belgeTip != null ? belgeTip.name() : null);
        dto.setBelgeNo(belgeNo != null ? belgeNo.toString() : null);
        dto.setYil(belgeYil != null ? belgeYil.toString() : null);
        dto.setKararNoAdi(kararNo);
        dto.setVkn(vkn);
        dto.setTckn(tckn);
        dto.setScopeValue(vkn != null ? vkn : tckn);

        String userSicil = SAMUtils.getSimdikiKullaniciSicili();
        String subeId = kullaniciBilgileriService.getKullaniciSubeId();

        // Request kaydetme
        return handleRequest(dto, userSicil, subeId);
    }


   private DocGrupVeri odemeMektupDetayBorcHazirlaArsiv(EftBilgiYonetimArsiv eftBilgiYonetimArsiv) throws Exception {

        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        LocalDate localDate = LocalDate.parse(eftBilgiYonetimArsiv.getKasTarih(), formatter);
        //MusteriHesabaOdeme eftMesaj = (MusteriHesabaOdeme) eftClientService.getGunlukKasMesajBySorguNoAndOdemeTarihi(eftBilgiYonetimArsiv.getKasSorguNo(), localDate);

        DocGrupVeri detayBorclar = new DocGrupVeri();
        detayBorclar.setGrupAd("BORCBILGILERI");

        /*if (eftBilgiYonetimArsiv.getBorcBilgiArsiv() != null && BorcTipEnum.SGK.getKod().equals(eftBilgiYonetimArsiv.getBorcBilgiArsiv().getBorcTipi())) {
            BorcBilgiArsiv borcBilgiArsiv = eftBilgiYonetimArsiv.getBorcBilgiArsiv();
            detayBorclar.addAlanVeri("BORCALICISI", borcBilgiArsiv.getAliciAdi());
            detayBorclar.addAlanVeri("BORCTUTARI", borcBilgiArsiv.getTutar());
        } else {
            detayBorclar.addAlanVeri("BORCALICISI", eftMesaj.getAlAd());
            detayBorclar.addAlanVeri("BORCTUTARI", new BigDecimal(StringUtil.formatVirgulToNokta(eftMesaj.getTtr())));
        }*/


            detayBorclar.addAlanVeri("BORCALICISI", "test");
            detayBorclar.addAlanVeri("BORCTUTARI", new BigDecimal(1));


        /*String eftBankaKoduAdi = eftMesaj.getAlKK() + "-"
                + bankaSubeService.getBankaForBankaKodu(eftMesaj.getAlKK()).getAd();*/
        String eftBankaKoduAdi = "test";

        StringBuilder sb = new StringBuilder(eftBankaKoduAdi.trim());
        if (sb.length() > 30) {
            sb.setLength(30);
        }
        /*detayBorclar.addAlanVeri("EFTBANKAKODUADI", sb.toString());
        detayBorclar.addAlanVeri("EFTHESAP", eftMesaj.getAlHesN());
        detayBorclar.addAlanVeri("EFTTARIHI", eftMesaj.getTrh());
        detayBorclar.addAlanVeri("EFTSORGUNO", eftMesaj.getSN());
        detayBorclar.addAlanVeri("EFTACIKLAMA", eftMesaj.getAcklm());*/

        detayBorclar.addAlanVeri("EFTBANKAKODUADI", "test");
        detayBorclar.addAlanVeri("EFTHESAP", "test");
        detayBorclar.addAlanVeri("EFTTARIHI", "test");
        detayBorclar.addAlanVeri("EFTSORGUNO", "test");
        detayBorclar.addAlanVeri("EFTACIKLAMA", "test");

        return detayBorclar;
    }


  public List<DocGrupVeri> getOdemeMektupBorcBilgileri(ProvizyonArsiv provizyon, Boolean sadeceBorcYazdir) {

        List<EftBilgiYonetimArsiv> eftBilgiYonetimList = eftBilgisiYonetimArsivRepository.getEftBilgiYonetimArsivsByProvizyonId(provizyon.getId());
        if (eftBilgiYonetimList == null || eftBilgiYonetimList.isEmpty()) {
            return new ArrayList<>();
        }
        return eftBilgiYonetimList.stream()
                .filter(eftBilgiYonetim -> eftBilgiYonetim.getKasTarih() != null && !sadeceBorcYazdir)
                .map(eftBilgiYonetim -> {
                    try {
                        return this.odemeMektupDetayBorcHazirlaArsiv(eftBilgiYonetim);
                    } catch (Exception e) {
                        System.err.println("OdemeMektupDetayBorcHazirla-arsiv hatası: " + e.getMessage()); // Hata mesajını logla
                        return null; // veya uygun bir hata değeri döndür
                    }
                }).filter(Objects::nonNull)
                .collect(Collectors.toUnmodifiableList());
    }


 private DocGrupVeri odemeMektupDetayBorcHazirla(EftBilgiYonetim eftBilgiYonetim) throws Exception {

        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        LocalDate localDate = LocalDate.parse(eftBilgiYonetim.getKasTarih(), formatter);
        //MusteriHesabaOdeme eftMesaj = (MusteriHesabaOdeme) eftClientService.getGunlukKasMesajBySorguNoAndOdemeTarihi(eftBilgiYonetim.getKasSorguNo(), localDate);

        DocGrupVeri detayBorclar = new DocGrupVeri();
        detayBorclar.setGrupAd("BORCBILGILERI");

        /*if (eftBilgiYonetim.getBorcBilgi() != null && BorcTipEnum.SGK.getKod().equals(eftBilgiYonetim.getBorcBilgi().getBorcTipi())) {
            BorcBilgi borcBilgi = eftBilgiYonetim.getBorcBilgi();
            detayBorclar.addAlanVeri("BORCALICISI", borcBilgi.getAliciAdi());
            detayBorclar.addAlanVeri("BORCTUTARI", borcBilgi.getTutar());

        } else {
            detayBorclar.addAlanVeri("BORCALICISI", eftMesaj.getAlAd());
            detayBorclar.addAlanVeri("BORCTUTARI", new BigDecimal(StringUtil.formatVirgulToNokta(eftMesaj.getTtr())));
        }*/

        //todo
        if (eftBilgiYonetim.getBorcBilgi() != null && BorcTipEnum.SGK.getKod().equals(eftBilgiYonetim.getBorcBilgi().getBorcTipi())) {
            BorcBilgi borcBilgi = eftBilgiYonetim.getBorcBilgi();
            detayBorclar.addAlanVeri("BORCALICISI", borcBilgi.getAliciAdi());
            detayBorclar.addAlanVeri("BORCTUTARI", borcBilgi.getTutar());

        } else {
            detayBorclar.addAlanVeri("BORCALICISI", "test");
            detayBorclar.addAlanVeri("BORCTUTARI", new BigDecimal(1));
        }

        /*String eftBankaKoduAdi = eftMesaj.getAlKK() + "-"
                + bankaSubeService.getBankaForBankaKodu(eftMesaj.getAlKK()).getAd();*/

        //todo
        String eftBankaKoduAdi = "test";



        StringBuilder sb = new StringBuilder(eftBankaKoduAdi.trim());
        if (sb.length() > 30) {
            sb.setLength(30);
        }
        /*detayBorclar.addAlanVeri("EFTBANKAKODUADI", sb.toString());
        detayBorclar.addAlanVeri("EFTHESAP", eftMesaj.getAlHesN());
        detayBorclar.addAlanVeri("EFTTARIHI", eftMesaj.getTrh());
        detayBorclar.addAlanVeri("EFTSORGUNO", eftMesaj.getSN());
        detayBorclar.addAlanVeri("EFTACIKLAMA", eftMesaj.getAcklm());*/

        detayBorclar.addAlanVeri("EFTBANKAKODUADI", sb.toString());
        detayBorclar.addAlanVeri("EFTHESAP", "test");
        detayBorclar.addAlanVeri("EFTTARIHI", "test");
        detayBorclar.addAlanVeri("EFTSORGUNO", "test");
        detayBorclar.addAlanVeri("EFTACIKLAMA", "test");


        return detayBorclar;
    }


 public List<DocGrupVeri> getOdemeMektupBorcBilgileri(Provizyon provizyon, Boolean sadeceBorcYazdir) {

        List<EftBilgiYonetim> eftBilgiYonetimList = eftBilgisiYonetimRepository.getEftBilgiYonetimsByProvizyonId(provizyon.getId());
        if (eftBilgiYonetimList == null || eftBilgiYonetimList.isEmpty()) {
            return new ArrayList<>();
        }
        return eftBilgiYonetimList.stream()
                .filter(eftBilgiYonetim -> eftBilgiYonetim.getKasTarih() != null && !sadeceBorcYazdir)
                .map(eftBilgiYonetim -> {
                    try {
                        return this.odemeMektupDetayBorcHazirla(eftBilgiYonetim);
                    } catch (Exception e) {
                        log.error("OdemeMektupDetayBorcHazirla hatası: " + e.getMessage()); // Hata mesajını logla
                        return null; // veya uygun bir hata değeri döndür
                    }
                }).filter(Objects::nonNull)
                .collect(Collectors.toUnmodifiableList());
    }

  public BigDecimal getProvizyonArsivToplamTutar(ProvizyonArsiv provizyon, boolean sadeceBorcYazdir) {
        BigDecimal toplamTutar = BigDecimal.ZERO;
        Long provizyonId = provizyon.getId();
        if (provizyonId == null) {
            return toplamTutar;
        }
        List<EftBilgiYonetimArsiv> eftBilgiYonetimList = eftBilgisiYonetimArsivRepository.getEftBilgiYonetimArsivsByProvizyonId(provizyonId);
        Map<BigDecimal, EftBilgiYonetimArsiv> eftBilgiYonetimMap = new HashMap<>();
        for (EftBilgiYonetimArsiv eftBilgiYonetim : eftBilgiYonetimList) {
            eftBilgiYonetimMap.put(new BigDecimal(String.valueOf(eftBilgiYonetim.getBorcBilgiArsiv().getId())), eftBilgiYonetim);
        }
        List<Long> borcIdList = eftBilgiYonetimList.stream().map(EftBilgiYonetimArsiv::getBorcBilgiArsiv).map(BorcBilgiArsiv::getId).sorted().collect(Collectors.toList());
        List<BorcBilgiArsiv> borcBilgiList = borcBilgiService.getBorcBilgiArsivList(provizyon);
        for (Long currentBorcId : borcIdList) {
            BigDecimal borcId = BigDecimal.valueOf(currentBorcId);
            if (sadeceBorcYazdir && borcBilgiList.stream().noneMatch(borcBilgi -> new BigDecimal(borcBilgi.getId()).equals(borcId))) {
                continue;
            }
            EftBilgiYonetimArsiv eftBilgiYonetim = eftBilgiYonetimMap.get(borcId);
            if (eftBilgiYonetim.getKasTarih() == null) {
                continue;
            }
            toplamTutar = toplamTutar.add(eftBilgiYonetim.getTutar());
        }
        return toplamTutar;
    }

 public List<DocGrupVeri> getOdemeMektupDetayByProvizyon(ProvizyonArsiv provizyonArsiv) {
        SimpleDateFormat sdfTarih = new SimpleDateFormat("dd/MM/yyyy");
        List<DocGrupVeri> veriler = new ArrayList<>();
        List<DocGrupVeri> borclar = getOdemeMektupBorcBilgileri(provizyonArsiv, false);
        if (CollectionUtils.isEmpty(borclar)) {
            return new ArrayList<>();
        }
        DocGrupVeri detayGrup = new DocGrupVeri();
        detayGrup.setGrupAd("DETAY");
        Ihracatci ihracatci = provizyonArsiv.getIhracatci();
        detayGrup.addAlanVeri("IHRACATCIADI", ihracatci.getAd());
        String adres1 = ihracatci.getAdres().trim();
        String adres2 = StringUtils.EMPTY;
        String adres3 = StringUtils.EMPTY;
        if (adres1.length() > 50) {
            if (adres1.length() > 100) {
                adres3 = adres1.substring(100);
                adres2 = adres1.substring(50, 100);
            } else {
                adres2 = adres1.substring(50);
                adres1 = adres1.substring(0, 50);
            }
        }

        detayGrup.addAlanVeri("IHRACATCIADRES1", adres1);
        detayGrup.addAlanVeri("IHRACATCIADRES2", adres2);
        detayGrup.addAlanVeri("IHRACATCIADRES3", adres3);
        detayGrup.addAlanVeri("TARIH", sdfTarih.format(new Date()));
        detayGrup.addAlanVeri("KARARNO", provizyonArsiv.getKarar().getKararNo());
        String kararAraMetin = "sayılı %s ";
        detayGrup.addAlanVeri("KARARADI", String.format(kararAraMetin, provizyonArsiv.getKarar().getAd()));
        detayGrup.addAlanVeri("PROVIZYONTUTAR", getProvizyonArsivToplamTutar(provizyonArsiv, false));
        detayGrup.addAlanVeri("ODEMETARIH", sdfTarih.format(provizyonArsiv.getOdemeTarih()));
        SubeKoduEnum subeKoduEnum = SubeKoduEnum.getById(provizyonArsiv.getKarar().getSubeId());
        if (SubeKoduEnum.ANKARA.equals(subeKoduEnum) && !KararTipiEnum.TARIMSAL.equals(KararTipiEnum.getBykod(provizyonArsiv.getKarar().getTip()))) {
            subeKoduEnum = SubeKoduEnum.IDARE_MERKEZI;
        }
        detayGrup.addAlanVeri("TCMBSUBEADI", subeKoduEnum != null ? subeKoduEnum.getAdi() : null);
        veriler.add(detayGrup);
        veriler.addAll(borclar);
        return veriler;
    }

 public List<DocGrupVeri> getOdemeMektupDetayByProvizyon(Provizyon provizyon) {
        SimpleDateFormat sdfTarih = new SimpleDateFormat("dd/MM/yyyy");
        List<DocGrupVeri> veriler = new ArrayList<>();
        List<DocGrupVeri> borclar = getOdemeMektupBorcBilgileri(provizyon, false);
        if (CollectionUtils.isEmpty(borclar)) {
            return new ArrayList<>();
        }
        DocGrupVeri detayGrup = new DocGrupVeri();
        detayGrup.setGrupAd("DETAY");
        Ihracatci ihracatci = provizyon.getIhracatci();
        detayGrup.addAlanVeri("IHRACATCIADI", ihracatci.getAd());
        String adres1 = ihracatci.getAdres().trim();
        String adres2 = StringUtils.EMPTY;
        String adres3 = StringUtils.EMPTY;
        if (adres1.length() > 50) {
            if (adres1.length() > 100) {
                adres3 = adres1.substring(100);
                adres2 = adres1.substring(50, 100);
            } else {
                adres2 = adres1.substring(50);
                adres1 = adres1.substring(0, 50);
            }
        }

        detayGrup.addAlanVeri("IHRACATCIADRES1", adres1);
        detayGrup.addAlanVeri("IHRACATCIADRES2", adres2);
        detayGrup.addAlanVeri("IHRACATCIADRES3", adres3);
        detayGrup.addAlanVeri("TARIH", sdfTarih.format(new Date()));
        detayGrup.addAlanVeri("KARARNO", provizyon.getKarar().getKararNo());
        String kararAraMetin = "sayılı %s ";
        detayGrup.addAlanVeri("KARARADI", String.format(kararAraMetin, provizyon.getKarar().getAd()));
        detayGrup.addAlanVeri("PROVIZYONTUTAR", provizyon.getTutar());
        detayGrup.addAlanVeri("ODEMETARIH", sdfTarih.format(provizyon.getOdemeTarih()));

        SubeKoduEnum subeKoduEnum = SubeKoduEnum.getById(provizyon.getKarar().getSubeId());
        if (SubeKoduEnum.ANKARA.equals(subeKoduEnum) && !KararTipiEnum.TARIMSAL.equals(KararTipiEnum.getBykod(provizyon.getKarar().getTip()))) {
            subeKoduEnum = SubeKoduEnum.IDARE_MERKEZI;
        }
        detayGrup.addAlanVeri("TCMBSUBEADI", subeKoduEnum != null ? subeKoduEnum.getAdi() : null);

        veriler.add(detayGrup);
        veriler.addAll(borclar);
        return veriler;
    }


   private boolean isValidProvizyonAndBorcBilgi(Provizyon provizyon, List<BorcBilgi> borcBilgis) {
        return provizyon != null &&
                provizyon.getIhracatci() != null &&
                StringUtils.isNotEmpty(provizyon.getIhracatci().getEmail()) &&
                CollectionUtils.isNotEmpty(borcBilgis);
    }

    private boolean isValidProvizyonArsivAndBorcBilgiArsiv(ProvizyonArsiv provizyonArsiv, List<BorcBilgiArsiv> borcBilgiArsivs) {
        return provizyonArsiv != null &&
                provizyonArsiv.getIhracatci() != null &&
                StringUtils.isNotEmpty(provizyonArsiv.getIhracatci().getEmail()) &&
                CollectionUtils.isNotEmpty(borcBilgiArsivs);
    }






 

//////unitttt
package tr.gov.tcmb.ogmdfif.service.handler;

import com.itextpdf.text.PageSize;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.context.junit4.SpringRunner;
import tr.gov.tcmb.ogmdfif.constant.KararTipiEnum;
import tr.gov.tcmb.ogmdfif.constant.LetterStatusEnum;
import tr.gov.tcmb.ogmdfif.constant.MailTypeEnum;
import tr.gov.tcmb.ogmdfif.constant.MektupTipEnum;
import tr.gov.tcmb.ogmdfif.model.dto.LetterNotifyLogDTO;
import tr.gov.tcmb.ogmdfif.model.dto.LetterRequestDto;
import tr.gov.tcmb.ogmdfif.model.dto.LetterRequestListePageDTO;
import tr.gov.tcmb.ogmdfif.model.entity.*;
import tr.gov.tcmb.ogmdfif.repository.LetterRequestRepository;
import tr.gov.tcmb.ogmdfif.service.*;
import tr.gov.tcmb.ogmdfif.service.impl.LetterJobTxService;

import javax.print.attribute.standard.OrientationRequested;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.text.ParseException;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.Executor;

import static org.hamcrest.CoreMatchers.*;
import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@RunWith(SpringRunner.class)
@SpringBootTest
public class OdemeMektupLetterHandlerTest {

    @Autowired
    private OdemeMektupLetterHandler handler;

    // persistence / tx
    @MockBean private LetterRequestRepository letterRequestRepo;
    @MockBean private LetterJobTxService jobTxService;
    @MockBean private LetterRequestTransactionService letterRequestTransactionService;

    // converters
    @MockBean private LetterRequestConverterService letterRequestConverter;
    @MockBean private LetterItemConverterService letterItemConverter;
    @MockBean private LetterNotificationLogConverterService letterNotificationLogConverterService;

    // services used inside handler
    @MockBean private ProvizyonIslemleriService provizyonIslemleriService;
    @MockBean private KararIslemleriService kararIslemleriService;
    @MockBean private OrtakMektupIslemlerService ortakMektupIslemlerService;
    @MockBean private BorcBilgiService borcBilgiService;
    @MockBean private PikurIslemService pikurIslemService;
    @MockBean private BankaSubeService bankaSubeService;
    @MockBean private EftBilgisiYonetimRepository eftBilgisiYonetimRepository;
    @MockBean private EftBilgisiYonetimArsivRepository eftBilgisiYonetimArsivRepository;
    @MockBean private ProvizyonArsivIslemleriRepository provizyonArsivIslemleriRepository;
    @MockBean private EFTClientService eftClientService;
    @MockBean private KullaniciBilgileriService kullaniciBilgileriService;
    @MockBean private LetterNotificationLogService letterNotificationLogService;
    @MockBean private MailFacade mailFacade;

    // async
    @MockBean(name = "letterReqExecutor")
    private Executor letterReqExecutor;

    // Spy (gövdenin bazı kısımlarını stub’lamak için)
    @SpyBean
    private OdemeMektupLetterHandler spyHandler;

    // ---------- HELPERS ----------
    private LetterRequestDto makeValidDto() {
        LetterRequestDto dto = new LetterRequestDto();
        dto.setRequestTypeId(String.valueOf(MektupTipEnum.convertMektupTipToRequestTypeId(MektupTipEnum.ODEME_MEKTUPLARI)));
        dto.setFirstPaymentDate(LocalDate.now().toString());
        dto.setLastPaymentDate(LocalDate.now().toString());
        dto.setTahakkukTuru(KararTipiEnum.TARIMSAL.name());
        dto.setBelgeNo("1");
        dto.setYil(String.valueOf(LocalDate.now().getYear()));
        dto.setKararNoAdi("K-123");
        dto.setVkn("1234567890");
        dto.setScopeValue("1234567890");
        return dto;
    }

    private LetterRequest makeSavedEntity(UUID id) {
        LetterRequest lr = new LetterRequest();
        lr.setId(id);
        lr.setRequestTypeId(String.valueOf(MektupTipEnum.convertMektupTipToRequestTypeId(MektupTipEnum.ODEME_MEKTUPLARI)));
        lr.setBelgeNo("1");
        lr.setYil(String.valueOf(LocalDate.now().getYear()));
        lr.setKararNoAdi("K-123");
        lr.setStatusId(Short.valueOf(LetterStatusEnum.YENI.getKod()));
        lr.setFirstPaymentDate(LocalDate.now());
        lr.setLastPaymentDate(LocalDate.now());
        return lr;
    }

    // ---------- TESTS ----------

    @Test
    public void handleRequest_happyPath_savesEntity_insertsItems_andPublishesEvent() throws Exception {
        // arrange
        LetterRequestDto dto = makeValidDto();
        UUID newId = UUID.randomUUID();
        LetterRequest toSave = new LetterRequest();
        toSave.setId(newId);

        // converter dto->entity (mapDtoToEntity içindeki converter çağrısı)
        doAnswer(inv -> {
            LetterRequestDto inDto = inv.getArgument(0);
            LetterRequest entity = inv.getArgument(1);
            entity.setRequestTypeId(inDto.getRequestTypeId());
            entity.setBelgeNo(inDto.getBelgeNo());
            entity.setYil(inDto.getYil());
            entity.setKararNoAdi(inDto.getKararNoAdi());
            entity.setFirstPaymentDate(LocalDate.parse(inDto.getFirstPaymentDate()));
            entity.setLastPaymentDate(LocalDate.parse(inDto.getLastPaymentDate()));
            return null;
        }).when(letterRequestConverter).doConvertToDto(any(LetterRequestDto.class), any(LetterRequest.class));

        when(letterRequestRepo.save(any(LetterRequest.class)))
                .thenAnswer(inv -> {
                    LetterRequest e = inv.getArgument(0);
                    e.setId(newId);
                    return e;
                });

        // handleLetterTransactions karmaşıklığını izole etmek için spy ile stub
        Map<String, String> receivers = new HashMap<>();
        receivers.put("42", "1234567890");
        doReturn(receivers).when(spyHandler).handleLetterTransactions(any(LetterRequest.class));

        // act
        UUID result = spyHandler.handleRequest(dto, "userX", "SUBE1");

        // assert
        assertThat(result, is(newId));
        verify(letterRequestRepo, times(1)).save(any(LetterRequest.class));
        verify(jobTxService, times(1)).insertLetterItemsBatch(eq(newId), eq(receivers));
        // Hata maili gitmemeli
        verify(ortakMektupIslemlerService, never())
                .sendDesicionLetterEmail(any(), any(), any(), contains("hata"), any(), any(), any());
    }

    @Test(expected = IllegalArgumentException.class)
    public void handleRequest_invalidDates_throws() throws Exception {
        LetterRequestDto dto = makeValidDto();
        // first > last olacak şekilde boz
        dto.setFirstPaymentDate(LocalDate.now().plusDays(1).toString());
        dto.setLastPaymentDate(LocalDate.now().toString());

        handler.handleRequest(dto, "userX", "SUBE1");
    }

    @Test(expected = IllegalArgumentException.class)
    public void handleRequest_bothVknAndTckn_throws() throws Exception {
        LetterRequestDto dto = makeValidDto();
        dto.setTckn("11111111111"); // VKN de dolu, ikisi birlikte yasak
        handler.handleRequest(dto, "userX", "SUBE1");
    }

    @Test
    public void insertLetterItem_whenNoReceivers_finishesRequestWithCode6() throws Exception {
        LetterRequest lr = makeSavedEntity(UUID.randomUUID());

        // receivers yok
        doReturn(Collections.emptyMap()).when(spyHandler).handleLetterTransactions(any(LetterRequest.class));

        spyHandler.insertLetterItem(lr);

        verify(jobTxService, times(1))
                .finishRequest(eq(lr.getId()), eq((short)6), eq("NO_RECEIVER"),
                        contains("buluanamadı")); // yazım aynı olmalı
        verify(jobTxService, never()).insertLetterItemsBatch(any(), anyMap());
    }

    @Test
    public void outputAsPDF_setsMetaCorrectly() {
        byte[] data = "pdf".getBytes();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        baos.write(data, 0, data.length);

        ExportedFile file = handler.outputAsPDF(baos, "dosya.pdf");
        assertThat(file, notNullValue());
        assertThat(file.getFileName(), is("dosya.pdf"));
        assertThat(file.getMimeType(), containsString("pdf"));
        assertArrayEquals(data, file.getData());
    }

    @Test
    public void islemYapOdemeMektuplari_validInputs_createsPdf_andSendsEmail() throws Exception {
        // arrange provizyon + borç
        Provizyon provizyon = new Provizyon();
        provizyon.setId(100L);
        Ihracatci ihr = new Ihracatci();
        ihr.setAd("ACME AŞ");
        ihr.setAdres("Kısa adres satırı 1");
        ihr.setEmail("ihr@acme.com");
        provizyon.setIhracatci(ihr);

        Karar karar = new Karar();
        karar.setKararNo("K-1");
        karar.setAd("Karar Adı");
        karar.setSubeId(10);
        karar.setTip((short)1);
        provizyon.setKarar(karar);

        provizyon.setOdemeTarih(new Date());
        provizyon.setTutar(new BigDecimal("123.45"));

        BorcBilgi borc = new BorcBilgi();
        borc.setId(1L);

        LetterRequest req = makeSavedEntity(UUID.randomUUID());
        LetterItem item = new LetterItem();
        item.setId(UUID.randomUUID());
        item.setReceiverKey(String.valueOf(provizyon.getId()));

        // PDF üretimi stub
        when(pikurIslemService.xmlYukle(anyString())).thenReturn(new tr.gov.tcmb.submuhm.pikur.PikurDocument(PageSize.A4, OrientationRequested.PORTRAIT));
        when(pikurIslemService.pdfDocOlustur(any(), any(), any(), any()))
                .thenReturn(new ByteArrayOutputStream());

        // borç verileri
        EftBilgiYonetim e = new EftBilgiYonetim();
        e.setKasTarih("01/01/2025");
        e.setBorcBilgi(borc);
        when(eftBilgisiYonetimRepository.getEftBilgiYonetimsByProvizyonId(eq(provizyon.getId())))
                .thenReturn(Collections.singletonList(e));

        // getOdemeMektupDetayByProvizyon içi alanları üretirken banka vs. test değerleri dönüyor

        // act
        handler.islemYapOdemeMektuplari(provizyon, Collections.singletonList(borc), req, item);

        // assert: standard mail gönderilmeli
        verify(ortakMektupIslemlerService, times(1))
                .sendDesicionLetterEmail(eq(provizyon), isNull(), any(ExportedFile.class), isNull(),
                        eq(req), eq(item), eq(MailTypeEnum.STANDART));
    }

    @Test
    public void handleGetLetterRequestDtoTransaction_pagination_and_mapping_ok() throws Exception {
        // arrange: 3 kayıt, sayfa boyutu 2 → 2 sayfa
        LetterRequest lr1 = makeSavedEntity(UUID.randomUUID());
        LetterRequest lr2 = makeSavedEntity(UUID.randomUUID());
        LetterRequest lr3 = makeSavedEntity(UUID.randomUUID());
        when(letterRequestTransactionService.listLetterRequest(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(Arrays.asList(lr1, lr2, lr3));

        // item map
        LetterItem li1 = new LetterItem();
        li1.setId(UUID.randomUUID());
        li1.setRequestId(lr1.getId());
        li1.setStatusId(Short.valueOf(LetterStatusEnum.YENI.getKod()));

        Map<UUID, List<LetterItem>> itemsMap = new HashMap<>();
        itemsMap.put(lr1.getId(), Collections.singletonList(li1));
        itemsMap.put(lr2.getId(), Collections.emptyList());
        itemsMap.put(lr3.getId(), Collections.emptyList());

        when(letterRequestTransactionService.loadItemByLetterRequestIds(anyList()))
                .thenReturn(itemsMap);

        // converter’ları no-op
        doAnswer(inv -> null).when(letterRequestConverter).doConvertToEntity(any(LetterRequest.class), any(LetterRequestDto.class));
        doAnswer(inv -> null).when(letterItemConverter).doConvertToDto(any(), any());

        // notify logs
        when(letterNotificationLogService.getLetterNotificationLogRecords(anyString(), any()))
                .thenReturn(Collections.emptyList());

        // executor: synchronous çalıştır (basitlik için)
        doAnswer(invocation -> {
            Runnable r = (Runnable) invocation.getArgument(0, Runnable.class);
            r.run();
            return null;
        }).when(letterReqExecutor).execute(any(Runnable.class));

        // act: 1. sayfa
        LetterRequestListePageDTO page1 = handler.handleGetLetterRequestDtoTransaction(
                1, 2, KararTipiEnum.TARIMSAL, 1,
                LocalDate.now().getYear(), "K-1",
                LocalDate.now(), LocalDate.now(),
                "1234567890", null, MektupTipEnum.ODEME_MEKTUPLARI
        );

        // assert page1
        assertThat(page1, notNullValue());
        assertThat(page1.getTotalSize(), is(3));
        assertThat(page1.getTotalPage(), is(2));
        assertThat(page1.getListe().size(), is(2));

        // act: 2. sayfa
        LetterRequestListePageDTO page2 = handler.handleGetLetterRequestDtoTransaction(
                2, 2, KararTipiEnum.TARIMSAL, 1,
                LocalDate.now().getYear(), "K-1",
                LocalDate.now(), LocalDate.now(),
                "1234567890", null, MektupTipEnum.ODEME_MEKTUPLARI
        );

        assertThat(page2.getListe().size(), is(1));
    }

    @Test
    public void islemYapOdemeMektuplari_missingEmailOrDebt_throwsValidation_andSendsErrorMail() {
        Provizyon provizyon = new Provizyon();
        provizyon.setId(200L);
        provizyon.setIhracatci(new Ihracatci()); // email null
        provizyon.setKarar(new Karar());

        LetterRequest req = makeSavedEntity(UUID.randomUUID());
        LetterItem item = new LetterItem();
        item.setId(UUID.randomUUID());
        item.setReceiverKey(String.valueOf(provizyon.getId()));

        try {
            handler.islemYapOdemeMektuplari(provizyon, Collections.emptyList(), req, item);
            fail("ValidationException bekleniyordu");
        } catch (Exception expected) {
            assertThat(expected.getMessage(), containsString("ihracatçı bilgileri eksiktir"));
        }
        // Hata maili islemYapOdemeMektuplari içinde fırlatılmadan önce gönderilmiyor (try/catch dışı),
        // bu nedenle burada mail gönderimi doğrulaması yapmıyoruz.
    }

    @Test
    public void handleExportFileName_format_ok() {
        String name = handler.handleExportFileName(
                LocalDate.of(2025, 8, 25),
                LocalDate.of(2025, 8, 26),
                MektupTipEnum.ODEME_MEKTUPLARI
        );
        // dd/MM/yyyy_dd/MM/yyyy_...
        assertThat(name, is("25/08/2025_26/08/2025_" + MektupTipEnum.ODEME_MEKTUPLARI.getAdi()));
    }
}



//gg


package tr.gov.tcmb.ogmdfif.service.handler;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.util.ReflectionTestUtils;
import tr.gov.tcmb.ogmdfif.model.dto.*;
import tr.gov.tcmb.ogmdfif.exception.ValidationException;
import tr.gov.tcmb.ogmdfif.model.entity.*;
import tr.gov.tcmb.ogmdfif.repository.EftBilgisiYonetimArsivRepository;
import tr.gov.tcmb.ogmdfif.repository.EftBilgisiYonetimRepository;
import tr.gov.tcmb.ogmdfif.repository.LetterRequestRepository;
import tr.gov.tcmb.ogmdfif.repository.ProvizyonArsivIslemleriRepository;
import tr.gov.tcmb.ogmdfif.service.*;
import tr.gov.tcmb.ogmdfif.service.event.LetterRequestCreatedEvent;
import tr.gov.tcmb.ogmdfif.service.impl.LetterJobTxService;
import tr.gov.tcmb.ogmdfif.constant.*;
import tr.gov.tcmb.ogmdfif.util.DateUtils;
import tr.gov.tcmb.ogmdfif.util.SAMUtils;
import tr.gov.tcmb.submuhm.pikur.model.veri.DocGrupVeri;
import tr.gov.tcmb.submuhm.pikur.model.veri.DocVeri;
import tr.gov.tcmb.submuhm.pikur.service.PikurIslemService;

import javax.print.attribute.standard.OrientationRequested;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@SpringBootTest
@ExtendWith(MockitoExtension.class)
class OdemeMektupLetterHandlerTest {

    @InjectMocks
    private OdemeMektupLetterHandler handler;

    // Mock all dependencies
    @Mock
    private ProvizyonIslemleriService provizyonIslemleriService;
    @Mock
    private KararIslemleriService kararIslemleriService;
    @Mock
    private OrtakMektupIslemlerService ortakMektupIslemlerService;
    @Mock
    private EftBilgisiYonetimArsivRepository eftBilgisiYonetimArsivRepository;
    @Mock
    private ProvizyonArsivIslemleriRepository provizyonArsivIslemleriRepository;
    @Mock
    private BorcBilgiService borcBilgiService;
    @Mock
    private PikurIslemService pikurIslemService;
    @Mock
    private BankaSubeService bankaSubeService;
    @Mock
    private EftBilgisiYonetimRepository eftBilgisiYonetimRepository;
    @Mock
    private LetterRequestRepository letterRequestRepo;
    @Mock
    private ApplicationEventPublisher eventPublisher;
    @Mock
    private LetterRequestConverterService letterRequestConverter;
    @Mock
    private LetterJobTxService jobTxService;
    @Mock
    private LetterItemConverterService letterItemConverter;
    @Mock
    private KullaniciBilgileriService kullaniciBilgileriService;
    @Mock
    private LetterRequestTransactionService letterRequestTransactionService;
    @Mock
    private LetterNotificationLogConverterService letterNotificationLogConverterService;
    @Mock
    private LetterNotificationLogService letterNotificationLogService;
    @Mock
    private MailFacade mailFacade;
    @Mock
    private Executor letterReqExecutor;

    private LetterRequestDto validDto;
    private LetterRequest letterRequest;
    private LetterItem letterItem;
    private Provizyon provizyon;
    private ProvizyonArsiv provizyonArsiv;
    private Ihracatci ihracatci;
    private Karar karar;

    @BeforeEach
    void setUp() {
        // Set up a valid DTO for testing
        validDto = new LetterRequestDto();
        validDto.setFirstPaymentDate("2023-01-01");
        validDto.setLastPaymentDate("2023-01-02");
        validDto.setRequestTypeId("1");
        validDto.setVkn("test-vkn");
        
        // Set field values using reflection
        ReflectionTestUtils.setField(handler, "perTaskTimeoutMs", 3000L);
        ReflectionTestUtils.setField(handler, "globalTimeoutMs", 10000L);
        
        // Initialize test entities
        letterRequest = new LetterRequest();
        letterRequest.setId(UUID.randomUUID());
        letterRequest.setStatusId((short) 1);
        
        letterItem = new LetterItem();
        letterItem.setId(UUID.randomUUID());
        letterItem.setReceiverKey("123");
        letterItem.setRequestId(letterRequest.getId());
        
        ihracatci = new Ihracatci();
        ihracatci.setEmail("test@example.com");
        ihracatci.setAd("Test İhracatçı");
        ihracatci.setAdres("Test Adres 123");
        
        karar = new Karar();
        karar.setKararNo("KARAR-123");
        karar.setAd("Test Karar");
        karar.setSubeId(SubeKoduEnum.IDARE_MERKEZI.getSubeId());
        karar.setTip(KararTipiEnum.TARIMSAL.getKod());
        karar.setNakitKarar(true);
        
        provizyon = new Provizyon();
        provizyon.setId(123L);
        provizyon.setIhracatci(ihracatci);
        provizyon.setKarar(karar);
        provizyon.setTutar(new BigDecimal("1000.00"));
        provizyon.setOdemeTarih(new Date());
        
        provizyonArsiv = new ProvizyonArsiv();
        provizyonArsiv.setId(456L);
        provizyonArsiv.setIhracatci(ihracatci);
        provizyonArsiv.setKarar(karar);
        provizyonArsiv.setOdemeTarih(new Date());
    }

    @Test
    void validate_ShouldThrowException_WhenFirstPaymentDateIsNull() {
        LetterRequestDto dto = new LetterRequestDto();
        dto.setLastPaymentDate("2023-01-02");
        
        Exception exception = assertThrows(IllegalArgumentException.class, 
            () -> ReflectionTestUtils.invokeMethod(handler, "validate", dto));
        
        assertEquals("İlk ve son ödeme tarihi zorunludur.", exception.getMessage());
    }

    @Test
    void validate_ShouldThrowException_WhenDatesHaveMoreThan2DaysDifference() {
        LetterRequestDto dto = new LetterRequestDto();
        dto.setFirstPaymentDate("2023-01-01");
        dto.setLastPaymentDate("2023-01-04");
        
        Exception exception = assertThrows(IllegalArgumentException.class, 
            () -> ReflectionTestUtils.invokeMethod(handler, "validate", dto));
        
        assertEquals("Tarihler arasındaki fark en fazla 2 gün olabilir.", exception.getMessage());
    }

    @Test
    void validate_ShouldNotThrow_WhenValidRequest() {
        assertDoesNotThrow(() -> ReflectionTestUtils.invokeMethod(handler, "validate", validDto));
    }

    @Test
    void handleRequest_ShouldReturnUUID_WhenValidRequest() throws Exception {
        // Mock dependencies
        when(letterRequestConverter.doConvertToDto(any(), any())).thenReturn(letterRequest);
        when(letterRequestRepo.save(any())).thenReturn(letterRequest);
        when(kullaniciBilgileriService.getKullaniciSubeId()).thenReturn("test-branch");
        
        // Mock SAMUtils static method
        try (var mockedSAMUtils = mockStatic(SAMUtils.class)) {
            mockedSAMUtils.when(SAMUtils::getSimdikiKullaniciSicili).thenReturn("test-user");
            
            UUID result = handler.handleRequest(validDto, "test-user", "test-branch");
            
            assertNotNull(result);
            verify(letterRequestRepo, times(1)).save(any());
            verify(eventPublisher, times(1)).publishEvent(any(LetterRequestCreatedEvent.class));
            verify(jobTxService, times(1)).insertLetterItemsBatch(any(), any());
        }
    }

    @Test
    void handleRequest_ShouldThrowException_WhenValidationFails() {
        LetterRequestDto invalidDto = new LetterRequestDto();
        
        assertThrows(Exception.class, 
            () -> handler.handleRequest(invalidDto, "test-user", "test-branch"));
    }

    @Test
    void nakitKontrolYap_ShouldThrowException_WhenKararNotFound() {
        when(kararIslemleriService.getKararByKararNoAndSube(any(), any())).thenReturn(null);
        
        Exception exception = assertThrows(ValidationException.class, 
            () -> ReflectionTestUtils.invokeMethod(handler, "nakitKontrolYap", "test-karar"));
        
        assertTrue(exception.getMessage().contains("Aradığınız karar bulunamamıştır"));
    }

    @Test
    void nakitKontrolYap_ShouldThrowException_WhenNotNakitKarar() {
        karar.setNakitKarar(false);
        when(kararIslemleriService.getKararByKararNoAndSube(any(), any())).thenReturn(karar);
        
        Exception exception = assertThrows(ValidationException.class, 
            () -> ReflectionTestUtils.invokeMethod(handler, "nakitKontrolYap", "test-karar"));
        
        assertTrue(exception.getMessage().contains("Ödeme mektupları sadece nakit ödemeler için üretilmektedir"));
    }

    @Test
    void nakitKontrolYap_ShouldNotThrow_WhenValidNakitKarar() {
        when(kararIslemleriService.getKararByKararNoAndSube(any(), any())).thenReturn(karar);
        
        assertDoesNotThrow(() -> ReflectionTestUtils.invokeMethod(handler, "nakitKontrolYap", "test-karar"));
    }

    @Test
    void handleInitialLetterRequestTransaction_ShouldReturnUUID_WhenValidInput() throws Exception {
        // Mock dependencies
        when(kullaniciBilgileriService.getKullaniciSubeId()).thenReturn("test-branch");
        when(letterRequestConverter.doConvertToDto(any(), any())).thenReturn(letterRequest);
        when(letterRequestRepo.save(any())).thenReturn(letterRequest);
        
        // Mock SAMUtils static method
        try (var mockedSAMUtils = mockStatic(SAMUtils.class)) {
            mockedSAMUtils.when(SAMUtils::getSimdikiKullaniciSicili).thenReturn("test-user");
            
            UUID result = handler.handleInitialLetterRequestTransaction(
                KararTipiEnum.TARIMSAL, 123, 2023, "karar-123",
                LocalDate.of(2023, 1, 1), LocalDate.of(2023, 1, 2),
                "vkn123", null, MektupTipEnum.ODEME_MEKTUPLARI
            );
            
            assertNotNull(result);
        }
    }

    @Test
    void testOutputAsPDF() {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        baos.write("test content".getBytes());
        
        ExportedFile result = ReflectionTestUtils.invokeMethod(
            handler, "outputAsPDF", baos, "test-file");
        
        assertNotNull(result);
        assertEquals("test-file", result.getFileName());
        assertArrayEquals("test content".getBytes(), result.getData());
        assertEquals("application/pdf", result.getMimeType());
    }

    @Test
    void validate_ShouldThrowException_WhenBothVknAndTcknProvided() {
        LetterRequestDto dto = new LetterRequestDto();
        dto.setFirstPaymentDate("2023-01-01");
        dto.setLastPaymentDate("2023-01-02");
        dto.setRequestTypeId("1");
        dto.setVkn("test-vkn");
        dto.setTckn("test-tckn");
        
        Exception exception = assertThrows(IllegalArgumentException.class, 
            () -> ReflectionTestUtils.invokeMethod(handler, "validate", dto));
        
        assertEquals("VKN ve TCKN aynı anda gönderilemez. Tekil işlemde birini gönderin.", exception.getMessage());
    }

    @Test
    void validate_ShouldThrowException_WhenRequestTypeIdIsNull() {
        LetterRequestDto dto = new LetterRequestDto();
        dto.setFirstPaymentDate("2023-01-01");
        dto.setLastPaymentDate("2023-01-02");
        
        Exception exception = assertThrows(IllegalArgumentException.class, 
            () -> ReflectionTestUtils.invokeMethod(handler, "validate", dto));
        
        assertEquals("mektupTip zorunludur.", exception.getMessage());
    }

    @Test
    void letterRequestProcessingStart_ShouldCallCorrectMethod_WhenOdemeTarihiMilattanSonra() throws Exception {
        // Mock DateUtils
        try (var mockedDateUtils = mockStatic(DateUtils.class)) {
            mockedDateUtils.when(() -> DateUtils.odemeTarihiMilattanSonraMi(any())).thenReturn(true);
            
            // Mock nakitKontrolYap
            when(kararIslemleriService.getKararByKararNoAndSube(any(), any())).thenReturn(karar);
            
            handler.letterRequestProcessingStart(letterRequest, letterItem);
            
            verify(handler, times(1)).mailAdresiOlanIhracatcilaraOdemeMektuplariGonder(any(), any());
        }
    }

    @Test
    void letterRequestProcessingStart_ShouldCallCorrectMethod_WhenOdemeTarihiMilattanOnce() throws Exception {
        // Mock DateUtils
        try (var mockedDateUtils = mockStatic(DateUtils.class)) {
            mockedDateUtils.when(() -> DateUtils.odemeTarihiMilattanSonraMi(any())).thenReturn(false);
            
            // Mock nakitKontrolYap
            when(kararIslemleriService.getKararByKararNoAndSube(any(), any())).thenReturn(karar);
            
            handler.letterRequestProcessingStart(letterRequest, letterItem);
            
            verify(handler, times(1)).mailAdresiOlanIhracatcilaraOdemeMektuplariGonderArsiv(any(), any());
        }
    }

    @Test
    void handleLetterTransactions_ShouldReturnProvizyonMap_WhenOdemeTarihiMilattanSonra() throws Exception {
        // Mock DateUtils
        try (var mockedDateUtils = mockStatic(DateUtils.class)) {
            mockedDateUtils.when(() -> DateUtils.odemeTarihiMilattanSonraMi(any())).thenReturn(true);
            
            // Mock provizyon list
            List<Provizyon> provizyonList = Arrays.asList(provizyon);
            when(provizyonIslemleriService.listProvizyon(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(provizyonList);
            when(provizyonIslemleriService.getSubeIdList()).thenReturn(Arrays.asList("1", "2"));
            
            Map<String, String> result = handler.handleLetterTransactions(letterRequest);
            
            assertNotNull(result);
            assertTrue(result.containsKey("123"));
        }
    }

    @Test
    void handleLetterTransactions_ShouldReturnProvizyonArsivMap_WhenOdemeTarihiMilattanOnce() throws Exception {
        // Mock DateUtils
        try (var mockedDateUtils = mockStatic(DateUtils.class)) {
            mockedDateUtils.when(() -> DateUtils.odemeTarihiMilattanSonraMi(any())).thenReturn(false);
            
            // Mock provizyon arşiv list
            List<ProvizyonArsiv> provizyonArsivList = Arrays.asList(provizyonArsiv);
            when(provizyonIslemleriService.listProvizyonArsiv(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(provizyonArsivList);
            when(provizyonIslemleriService.getSubeIdList()).thenReturn(Arrays.asList("1", "2"));
            
            Map<String, String> result = handler.handleLetterTransactions(letterRequest);
            
            assertNotNull(result);
            assertTrue(result.containsKey("456"));
        }
    }

    @Test
    void mailAdresiOlanIhracatcilaraOdemeMektuplariGonder_ShouldHandleNullProvizyon() throws Exception {
        when(provizyonIslemleriService.getProvizyonById(any())).thenReturn(null);
        
        handler.mailAdresiOlanIhracatcilaraOdemeMektuplariGonder(letterRequest, letterItem);
        
        verify(ortakMektupIslemlerService, times(1)).sendDesicionLetterEmail(
            eq(null), eq(null), eq(null), anyString(), eq(letterRequest), eq(letterItem), eq(MailTypeEnum.HATA_BILDIRIMI));
    }

    @Test
    void mailAdresiOlanIhracatcilaraOdemeMektuplariGonder_ShouldHandleEmptyBorcMap() throws Exception {
        when(provizyonIslemleriService.getProvizyonById(any())).thenReturn(provizyon);
        when(borcBilgiService.getBorcBilgiByProvizyonIdListWithoutIslemDurum(any()))
            .thenReturn(new ArrayList<>());
        
        handler.mailAdresiOlanIhracatcilaraOdemeMektuplariGonder(letterRequest, letterItem);
        
        verify(ortakMektupIslemlerService, times(1)).sendDesicionLetterEmail(
            eq(null), eq(null), eq(null), anyString(), eq(letterRequest), eq(letterItem), eq(MailTypeEnum.HATA_BILDIRIMI));
    }

    @Test
    void islemYapOdemeMektuplari_ShouldThrowException_WhenInvalidProvizyon() throws Exception {
        Provizyon invalidProvizyon = new Provizyon();
        List<BorcBilgi> borcBilgis = Arrays.asList(new BorcBilgi());
        
        Exception exception = assertThrows(ValidationException.class, 
            () -> handler.islemYapOdemeMektuplari(invalidProvizyon, borcBilgis, letterRequest, letterItem));
        
        assertTrue(exception.getMessage().contains("gerekli ihracatçı bilgileri eksiktir"));
    }

    @Test
    void islemYapOdemeMektuplari_ShouldThrowException_WhenEmptyProvizyonVeri() throws Exception {
        when(pikurIslemService.xmlYukle(anyString())).thenReturn(null);
        when(pikurIslemService.pdfDocOlustur(any(), any(), any(), any())).thenReturn(new ByteArrayOutputStream());
        
        List<BorcBilgi> borcBilgis = Arrays.asList(new BorcBilgi());
        
        Exception exception = assertThrows(ValidationException.class, 
            () -> handler.islemYapOdemeMektuplari(provizyon, borcBilgis, letterRequest, letterItem));
        
        assertTrue(exception.getMessage().contains("gerekli provizyon bilgileri eksiktir"));
    }

    @Test
    void handleGetLetterRequestDtoTransaction_ShouldReturnPageDTO() throws Exception {
        // Mock dependencies
        when(letterRequestTransactionService.listLetterRequest(any(), any(), any(), any(), any(), any(), any(), any(), any()))
            .thenReturn(Arrays.asList(letterRequest));
        when(letterRequestTransactionService.loadItemByLetterRequestIds(any()))
            .thenReturn(Collections.singletonMap(letterRequest.getId(), Arrays.asList(letterItem)));
        when(letterNotificationLogService.getLetterNotificationLogRecords(anyString(), any()))
            .thenReturn(new ArrayList<>());
        
        // Mock executor to run tasks synchronously for testing
        when(letterReqExecutor.execute(any())).thenAnswer(invocation -> {
            Runnable task = invocation.getArgument(0);
            task.run();
            return null;
        });
        
        LetterRequestListePageDTO result = handler.handleGetLetterRequestDtoTransaction(
            1, 10, KararTipiEnum.TARIMSAL, 123, 2023, "karar-123",
            LocalDate.of(2023, 1, 1), LocalDate.of(2023, 1, 2), "vkn123", null, MektupTipEnum.ODEME_MEKTUPLARI);
        
        assertNotNull(result);
        assertEquals(1, result.getTotalPages());
    }

    @Test
    void getOdemeMektupDetayByProvizyon_ShouldReturnDocGrupVeriList() {
        // Mock borc bilgileri
        List<DocGrupVeri> borcVerileri = Arrays.asList(new DocGrupVeri());
        when(handler.getOdemeMektupBorcBilgileri(any(), anyBoolean())).thenReturn(borcVerileri);
        
        List<DocGrupVeri> result = handler.getOdemeMektupDetayByProvizyon(provizyon);
        
        assertNotNull(result);
        assertFalse(result.isEmpty());
    }

    @Test
    void getOdemeMektupDetayByProvizyon_ShouldReturnEmptyList_WhenNoBorcBilgileri() {
        when(handler.getOdemeMektupBorcBilgileri(any(), anyBoolean())).thenReturn(new ArrayList<>());
        
        List<DocGrupVeri> result = handler.getOdemeMektupDetayByProvizyon(provizyon);
        
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    @Test
    void getOdemeMektupBorcBilgileri_ShouldReturnEmptyList_WhenNoEftBilgiYonetim() {
        when(eftBilgisiYonetimRepository.getEftBilgiYonetimsByProvizyonId(any())).thenReturn(new ArrayList<>());
        
        List<DocGrupVeri> result = handler.getOdemeMektupBorcBilgileri(provizyon, false);
        
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    @Test
    void handleExportFileName_ShouldReturnCorrectFormat() {
        LocalDate ilkOdemeTarihi = LocalDate.of(2023, 1, 1);
        LocalDate sonOdemeTarihi = LocalDate.of(2023, 1, 2);
        MektupTipEnum mektupTip = MektupTipEnum.ODEME_MEKTUPLARI;
        
        String result = handler.handleExportFileName(ilkOdemeTarihi, sonOdemeTarihi, mektupTip);
        
        assertEquals("01/01/2023_02/01/2023_Ödeme Mektupları", result);
    }

    @Test
    void insertLetterItem_ShouldCallJobTxService_WhenReceiversExist() throws Exception {
        Map<String, String> receivers = new HashMap<>();
        receivers.put("key", "value");
        
        when(handler.handleLetterTransactions(any())).thenReturn(receivers);
        
        handler.insertLetterItem(letterRequest);
        
        verify(jobTxService, times(1)).insertLetterItemsBatch(any(), eq(receivers));
    }

    @Test
    void insertLetterItem_ShouldFinishRequest_WhenNoReceivers() throws Exception {
        when(handler.handleLetterTransactions(any())).thenReturn(new HashMap<>());
        
        handler.insertLetterItem(letterRequest);
        
        verify(jobTxService, times(1)).finishRequest(any(), eq((short) 6), eq("NO_RECEIVER"), anyString());
    }

    @Test
    void mapDtoToEntity_ShouldReturnLetterRequest() {
        when(letterRequestConverter.doConvertToDto(any(), any())).thenReturn(letterRequest);
        
        LetterRequest result = handler.mapDtoToEntity(validDto, "test-user", "test-branch");
        
        assertNotNull(result);
        assertEquals("test-user", result.getCreatedBy());
        assertEquals("test-branch", result.getBranchId());
    }

    @Test
    void preparedNotifyLogDto_ShouldReturnEmptyList_WhenNoLogs() {
        when(letterNotificationLogService.getLetterNotificationLogRecords(anyString(), any()))
            .thenReturn(new ArrayList<>());
        
        List<LetterNotifyLogDTO> result = handler.preparedNotifyLogDto(letterItem);
        
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    // Additional edge case tests
    @Test
    void validate_ShouldThrowException_WhenFirstPaymentDateAfterLastPaymentDate() {
        LetterRequestDto dto = new LetterRequestDto();
        dto.setFirstPaymentDate("2023-01-02");
        dto.setLastPaymentDate("2023-01-01");
        dto.setRequestTypeId("1");
        
        Exception exception = assertThrows(IllegalArgumentException.class, 
            () -> ReflectionTestUtils.invokeMethod(handler, "validate", dto));
        
        assertEquals("İlk ödeme tarihi son ödeme tarihinden büyük olamaz.", exception.getMessage());
    }

    @Test
    void validate_ShouldThrowException_WhenLastPaymentDateBeforeFirstPaymentDate() {
        LetterRequestDto dto = new LetterRequestDto();
        dto.setFirstPaymentDate("2023-01-02");
        dto.setLastPaymentDate("2023-01-01");
        dto.setRequestTypeId("1");
        
        Exception exception = assertThrows(IllegalArgumentException.class, 
            () -> ReflectionTestUtils.invokeMethod(handler, "validate", dto));
        
        assertEquals("sonOdemeTarih, ilkOdemeTarih'ten önce olamaz.", exception.getMessage());
    }

    @Test
    void handleRequest_ShouldSendErrorEmail_WhenExceptionOccurs() throws Exception {
        // Force an exception
        when(letterRequestConverter.doConvertToDto(any(), any())).thenThrow(new RuntimeException("Test exception"));
        
        Exception exception = assertThrows(Exception.class, 
            () -> handler.handleRequest(validDto, "test-user", "test-branch"));
        
        assertTrue(exception.getMessage().contains("Mektup gönderme işlemi için talep kaydetme işlemi sırasında bir hata meydana geldi"));
    }
}



//son
package tr.gov.tcmb.ogmdfif.service.handler;

import com.itextpdf.text.PageSize;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections4.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tr.gov.tcmb.ogmdfif.constant.*;
import tr.gov.tcmb.ogmdfif.exception.ValidationException;
import tr.gov.tcmb.ogmdfif.model.dto.LetterItemDTO;
import tr.gov.tcmb.ogmdfif.model.dto.LetterNotifyLogDTO;
import tr.gov.tcmb.ogmdfif.model.dto.LetterRequestDto;
import tr.gov.tcmb.ogmdfif.model.dto.LetterRequestListePageDTO;
import tr.gov.tcmb.ogmdfif.model.entity.*;
import tr.gov.tcmb.ogmdfif.repository.EftBilgisiYonetimArsivRepository;
import tr.gov.tcmb.ogmdfif.repository.EftBilgisiYonetimRepository;
import tr.gov.tcmb.ogmdfif.repository.LetterRequestRepository;
import tr.gov.tcmb.ogmdfif.repository.ProvizyonArsivIslemleriRepository;
import tr.gov.tcmb.ogmdfif.service.*;
import tr.gov.tcmb.ogmdfif.service.event.LetterRequestCreatedEvent;
import tr.gov.tcmb.ogmdfif.service.impl.LetterJobTxService;
import tr.gov.tcmb.ogmdfif.util.*;
import tr.gov.tcmb.ogmdfif.ws.client.EFTClientService;
import tr.gov.tcmb.submuhm.pikur.PikurDocument;
import tr.gov.tcmb.submuhm.pikur.model.veri.DocGrupVeri;
import tr.gov.tcmb.submuhm.pikur.model.veri.DocVeri;
import tr.gov.tcmb.submuhm.pikur.service.PikurIslemService;


import javax.print.attribute.standard.OrientationRequested;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
@Slf4j
public class OdemeMektupLetterHandler implements LetterHandler {

    private final ProvizyonIslemleriService provizyonIslemleriService;
    private final KararIslemleriService kararIslemleriService;
    private final OrtakMektupIslemlerService ortakMektupIslemlerService;
    private final EFTClientService eftClientService;
    private final EftBilgisiYonetimArsivRepository eftBilgisiYonetimArsivRepository;
    private final ProvizyonArsivIslemleriRepository provizyonArsivIslemleriRepository;
    private final BorcBilgiService borcBilgiService;
    private final PikurIslemService pikurIslemService;
    private final BankaSubeService bankaSubeService;
    private final EftBilgisiYonetimRepository eftBilgisiYonetimRepository;
    private final LetterRequestRepository letterRequestRepo;
    private final ApplicationEventPublisher eventPublisher;
    private final LetterRequestConverterService letterRequestConverter;
    private final LetterJobTxService jobTxService;
    private final LetterItemConverterService letterItemConverter;
    private final KullaniciBilgileriService kullaniciBilgileriService;
    private final LetterRequestTransactionService letterRequestTransactionService;
    private final LetterNotificationLogConverterService letterNotificationLogConverterService;
    private final LetterNotificationLogService letterNotificationLogService;
    private final MailFacade mailFacade;

    @Qualifier("letterReqExecutor")
    private final Executor letterReqExecutor;


    @Value("${letterreq.per-task-timeout-ms:3000}")
    private long perTaskTimeoutMs;

    @Value("${letterreq.global-timeout-ms:10000}")
    private long globalTimeoutMs;


    private static final String ihracatciNakitOdemeMektubuPikurXMLPath = "print/IHRACATCINAKITODEMEMEKTUP.xml";


    private void nakitKontrolYap(String kararNo) throws ValidationException {
        Karar karar = kararIslemleriService.getKararByKararNoAndSube(kararNo, SubeKoduEnum.IDARE_MERKEZI.getSubeId());

        if (karar == null) {
            throw new ValidationException("Aradığınız karar bulunamamıştır. Karar No: " + kararNo);
        } else {
            if (!karar.isNakitKarar()) {
                throw new ValidationException("Ödeme mektupları sadece nakit ödemeler için üretilmektedir.");
            }
        }
    }

    @Override
    public UUID handleRequest(LetterRequestDto dto, String createdBy, String branchId) throws Exception {
        validate(dto);
        try {
            LetterRequest entity = mapDtoToEntity(dto, createdBy, branchId);
            if (entity == null) {
                throw new ValidationException("Mektup talep kaydı verisi hatalı!");
            }
            entity = letterRequestRepo.save(entity);

            // Item oluşturma
            insertLetterItem(entity);

            // Event publish → asenkron mail için
            eventPublisher.publishEvent(new LetterRequestCreatedEvent(entity.getId()));

            return entity.getId();
        } catch (Exception e) {
            String message = String.format("Mektup gönderme işlemi için talep kaydetme işlemi sırasında bir hata meydana geldi:  %s", dto);
            ortakMektupIslemlerService.sendDesicionLetterEmail(null, null, null, message, null, null, MailTypeEnum.HATA_BILDIRIMI);

            throw new Exception(message, e);
        }
    }


    private void validate(LetterRequestDto dto) {
        if (dto.getFirstPaymentDate() == null || dto.getLastPaymentDate() == null) {
            throw new IllegalArgumentException("İlk ve son ödeme tarihi zorunludur.");
        }

        LocalDate firstPaymentDate = LocalDate.parse(dto.getFirstPaymentDate());
        LocalDate lastPaymentDate = LocalDate.parse(dto.getLastPaymentDate());

        if (firstPaymentDate.isAfter(lastPaymentDate)) {
            throw new IllegalArgumentException("İlk ödeme tarihi son ödeme tarihinden büyük olamaz.");
        }

        if (lastPaymentDate.isBefore(firstPaymentDate)) {
            throw new IllegalArgumentException("sonOdemeTarih, ilkOdemeTarih'ten önce olamaz.");
        }

        long daysBetween = ChronoUnit.DAYS.between(firstPaymentDate, lastPaymentDate);

        if (Math.abs(daysBetween) > 2) {
            throw new IllegalArgumentException("Tarihler arasındaki fark en fazla 2 gün olabilir.");
        }

        if (dto.getRequestTypeId() == null) {
            throw new IllegalArgumentException("mektupTip zorunludur.");
        }
        if (StringUtils.isNotBlank(dto.getVkn()) && StringUtils.isNotBlank(dto.getTckn())) {
            throw new IllegalArgumentException("VKN ve TCKN aynı anda gönderilemez. Tekil işlemde birini gönderin.");
        }
    }


    private LetterRequest mapDtoToEntity(LetterRequestDto dto, String createdBy, String branchId) {
        return Stream.of(new LetterRequest())
                .peek(entity -> {
                    entity.setCreatedBy(createdBy);
                    entity.setBranchId(branchId);
                    letterRequestConverter.doConvertToDto(dto, entity);
                })
                .findFirst()
                .orElse(null);
    }

    public void insertLetterItem(LetterRequest entity) throws Exception {

        Map<String, String> receivers = handleLetterTransactions(entity);
        if (receivers == null || receivers.isEmpty()) {
            jobTxService.finishRequest(entity.getId(), (short) 6, "NO_RECEIVER", "Ödeme mektubu gönderilecek şartları sağlayan provizyon/ihracatçı buluanamadı!");
            return;
        }

        //receivers.forEach((key, value) -> jobTxService.insertItemIfNotExists(UUID.randomUUID(), entity.getId(), key, value));
        jobTxService.insertLetterItemsBatch(entity.getId(), receivers);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void letterRequestProcessingStart(LetterRequest request, LetterItem letterItem) throws Exception {
        try {
            if (StringUtils.isNotEmpty(request.getKararNoAdi())) {
                this.nakitKontrolYap(request.getKararNoAdi());
            }
            String provizyonId = letterItem.getReceiverKey();
            String letterReqId = request.getId().toString();

            log.info("letterRequestProcessingStart" + Constants.STR_ODEME_MEKTUP + " gönderme işlemi başlamıştır.ProvizyonId : {}", provizyonId, "Mektup-TalepID : " + letterReqId);

            if (DateUtils.odemeTarihiMilattanSonraMi(request)) {
                mailAdresiOlanIhracatcilaraOdemeMektuplariGonder(request, letterItem);
            } else {
                mailAdresiOlanIhracatcilaraOdemeMektuplariGonderArsiv(request, letterItem);
            }
        } catch (Exception e) {
            log.error("letterRequestProcessingStart-Ödeme mektup gönderim işlemi sırasında bir hata meydana geldi. {}", e.getMessage());

            String exMessage = String.format("Yapmak istediğiniz -ödeme mektubu gönderme işlemi- sırasında bir hata meydana geldi: %s ," +
                            "Talep Id: %s, Provizyon Id: %s",
                    e.getMessage(), request.getId(), letterItem.getReceiverKey());

            ortakMektupIslemlerService.sendDesicionLetterEmail(null, null, null, exMessage, request, letterItem,MailTypeEnum.HATA_BILDIRIMI);
        }
    }

    @Override
    public Map<String, String> handleLetterTransactions(LetterRequest request) throws Exception {
        log.info("handleOdemeMetupTransactions metodu çağrıldı. Request: {}", request);

        List<String> subeIdList = provizyonIslemleriService.getSubeIdList();
        Integer belgeNo = Objects.isNull(request.getBelgeNo()) ? null : Integer.valueOf(request.getBelgeNo());

        log.info("Ödeme tarihi milattan sonra mı kontrol ediliyor.");
        if (DateUtils.odemeTarihiMilattanSonraMi(request)) {
            log.info("Ödeme tarihi milattan sonra. Provizyon listesi çekiliyor.");
            List<Provizyon> provizyonList = provizyonIslemleriService.listProvizyon(request.getFirstPaymentDate(),
                    request.getLastPaymentDate(), KararTipiEnum.getByAdi(request.getTahakkukTuru()), belgeNo,
                    request.getYil(), request.getKararNoAdi(), request.getFirmaVkn(), request.getUreticiTckn(),
                    null, null, subeIdList);

            final int expected = provizyonList.size();
            final int capacity = (int) (expected * 1.34) + 1;
            Map<String, String> map = new HashMap<>(capacity);

            log.info("Provizyon listesi çekildi. Liste boyutu: {}", provizyonList.size());


            for (Provizyon provizyon : provizyonList) {
                Ihracatci ihr = provizyon.getIhracatci();
                String value = (ihr != null) ? ihr.getTcknVknAsString() : null;
                String key = String.valueOf(provizyon.getId());
                map.putIfAbsent(key, value);
            }

            return map;

        } else {
            log.info("Ödeme tarihi milattan önce veya eşit. Provizyon arşiv listesi çekiliyor.");
            List<ProvizyonArsiv> provizyonArsivList = provizyonIslemleriService.listProvizyonArsiv(request.getFirstPaymentDate(),
                    request.getLastPaymentDate(), KararTipiEnum.getByAdi(request.getTahakkukTuru()), belgeNo, request.getYil(), request.getKararNoAdi(),
                    request.getFirmaVkn(), request.getUreticiTckn(), null, null, subeIdList);

            log.info("Provizyon arşiv listesi çekildi. Liste boyutu: {}", provizyonArsivList.size());

            final int expectedArs = provizyonArsivList.size();
            final int capacityArs = (int) (expectedArs * 1.34) + 1;
            Map<String, String> arsivMap = new HashMap<>(capacityArs);

            for (ProvizyonArsiv provizyonArsiv : provizyonArsivList) {
                Ihracatci ihr = provizyonArsiv.getIhracatci();
                String value = (ihr != null) ? ihr.getTcknVknAsString() : null;
                String key = String.valueOf(provizyonArsiv.getId());
                arsivMap.putIfAbsent(key, value);
            }

            return arsivMap;
        }

    }

    public void mailAdresiOlanIhracatcilaraOdemeMektuplariGonder(LetterRequest request, LetterItem letterItem) throws Exception {
        log.info("odeme mektuplarini eposta ile gonder-E-mail adres bilgisi olan ihracatçılara mail ile mektup gönderme işlemi başladı");

        String provizyonId = letterItem.getReceiverKey();
        Provizyon provizyon = provizyonIslemleriService.getProvizyonById(new BigDecimal(provizyonId));

        if (Objects.isNull(provizyon)) {
            String exMessage = String.format("Yapmak istediğiniz -ödeme mektubu gönderme işlemi- için ödeme mektubu bulunamamıştır. TalepId : %s", request.getId());
            ortakMektupIslemlerService.sendDesicionLetterEmail(null, null, null,  exMessage, request, letterItem,MailTypeEnum.HATA_BILDIRIMI);
            return;
        }

        Map<Long, List<BorcBilgi>> borcMap = this.borcVerileriniTopluAl(List.of(provizyon));
        if (borcMap == null || borcMap.isEmpty()) {

            String exMessage = String.format("Ödeme mektubu gönderme işlemi sırasında provizyon borç bilgisi bulunamadı." +
                    "Provizyon ID: %s, Talep ID: %s. Lütfen provizyon bilgilerini kontrol edin veya destek ekibiyle iletişime geçin.", provizyon.getId(), request.getId());
            ortakMektupIslemlerService.sendDesicionLetterEmail(null, null, null,  exMessage, request, letterItem,MailTypeEnum.HATA_BILDIRIMI);
            return;
        }
        try {
            islemYapOdemeMektuplari(provizyon, borcMap.get(provizyon.getId()), request, letterItem);
        } catch (Exception e) {
            String exMessage = String.format("Yapmak istediğiniz -ödeme mektubu gönderme işlemi- sırasında bir hata meydana geldi: --->  %s hatadetay: %s : provizyonId : %s", e, e.getMessage(), provizyon.getId());

            log.error("mailAdresiOlanIhracatcilaraOdemeMektuplariGonder{}", exMessage, e);
            try {
                ortakMektupIslemlerService.sendDesicionLetterEmail(null, null, null,  exMessage, request, letterItem,MailTypeEnum.HATA_BILDIRIMI);
            } catch (ValidationException ex) {
                log.error("mailAdresiOlanIhracatcilaraOdemeMektuplariGonder" + "Hatayı eposta ile gönderme işlemi sırasında bir hata meydana geldi : {}", ex.getMessage());
                throw new ValidationException(exMessage);
            }
        }

        log.info("odeme mektuplarini eposta ile gonder-Kep bilgisi olan ihracatçılara mail ile mektup gönderme işlemi bitti");


    }

    public void mailAdresiOlanIhracatcilaraOdemeMektuplariGonderArsiv(LetterRequest request, LetterItem letterItem) throws Exception {
        log.info("odeme mektuplarini eposta ile gonder-Mail adresi bilgisi olan ihracatçılara mail ile mektup gönderme işlemi başladı");


        String provizyonArsivId = letterItem.getReceiverKey();
        ProvizyonArsiv provizyonArsiv = provizyonArsivIslemleriRepository.getProvizyonArsiv(Long.valueOf(provizyonArsivId));

        if (Objects.isNull(provizyonArsiv)) {

            String exMessage = String.format("Yapmak istediğiniz -ödeme mektubu gönderme işlemi- için ödeme mektubu bulunamamıştır. TalepId : %s", request.getId());
            ortakMektupIslemlerService.sendDesicionLetterEmail(null, null, null,  exMessage, request, letterItem,MailTypeEnum.HATA_BILDIRIMI);
            return;
        }

        Map<Long, List<BorcBilgiArsiv>> borcArsivMap = this.borcVerileriniTopluAlArsiv(List.of(provizyonArsiv));
        if (borcArsivMap == null || borcArsivMap.isEmpty()) {
            String exMessage = String.format("Ödeme mektubu gönderme işlemi sırasında provizyon borç bilgisi bulunamadı." +
                    "Provizyon ID: %s, Talep ID: %s. Lütfen provizyon bilgilerini kontrol edin veya destek ekibiyle iletişime geçin.", provizyonArsiv.getId(), request.getId());
            ortakMektupIslemlerService.sendDesicionLetterEmail(null, null, null,  exMessage, request, letterItem,MailTypeEnum.HATA_BILDIRIMI);
            return;
        }


        try {
            islemYapOdemeMektuplariArsiv(provizyonArsiv, borcArsivMap.get(provizyonArsiv.getId()), request, letterItem);
        } catch (Exception e) {
            String exMessage = String.format("Yapmak istediğiniz -ödeme mektubu gönderme işlemi- sırasında bir hata meydana geldi: %s : provizyonId : %s", e.getMessage(), provizyonArsiv.getId());
            log.error("mailAdresiOlanIhracatcilaraOdemeMektuplariGonder.{}", exMessage);
            try {

                ortakMektupIslemlerService.sendDesicionLetterEmail(null, null, null,  exMessage, request, letterItem,MailTypeEnum.HATA_BILDIRIMI);

            } catch (ValidationException ex) {
                log.error("mailAdresiOlanIhracatcilaraOdemeMektuplariGonderArsiv-Hatayı eposta ile gönderme işlemi sırasında bir hata meydana geldi : {}", ex.getMessage());
            }
        }
        log.info("odeme mektuplarini eposta ile gonder - Kep bilgisi olan ihracatçılara mail ile mektup gönderme işlemi bitti");
    }

    private Map<Long, List<BorcBilgi>> borcVerileriniTopluAl(List<Provizyon> provizyonList) {
        List<Long> provizyonIds = provizyonList.stream()
                //.filter(provizyon -> provizyon.getIhracatci().getEmail() != null)
                .map(Provizyon::getId)
                .collect(Collectors.toList());
        return borcBilgiService.getBorcBilgiByProvizyonIdListWithoutIslemDurum(provizyonIds)
                .stream()
                .collect(Collectors.groupingBy(borcBilgi -> borcBilgi.getProvizyon().getId()));
    }

    private Map<Long, List<BorcBilgiArsiv>> borcVerileriniTopluAlArsiv(List<ProvizyonArsiv> provizyonArsivList) {
        List<Long> provizyonArsivIds = provizyonArsivList.stream()
                .map(ProvizyonArsiv::getId)
                .collect(Collectors.toList());
        return borcBilgiService.getBorcBilgiByProvizyonArsivIdListWithoutIslemDurum(provizyonArsivIds)
                .stream()
                .collect(Collectors.groupingBy(borcBilgiArsiv -> borcBilgiArsiv.getProvizyonArsiv().getId()));
    }


    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void islemYapOdemeMektuplariArsiv(ProvizyonArsiv provizyonArsiv, List<BorcBilgiArsiv> borcBilgiArsivs, LetterRequest request,LetterItem letterItem) throws Exception {
        log.info("islemYapOdemeMektuplariArsiv- Odeme Mektuplari işlenmektedir.{}", provizyonArsiv.getId());


        if (!isValidProvizyonArsivAndBorcBilgiArsiv(provizyonArsiv, borcBilgiArsivs)){
            String exMessage = "Ödeme mektubu gönderme işlemi için gerekli ihracatçı bilgileri eksiktir. İhracatçı e-postası veya borç bilgileri bulunamadı";
            throw new ValidationException(exMessage);        }

        List<DocGrupVeri> provizyonVeri = getOdemeMektupDetayByProvizyon(provizyonArsiv);
        if (CollectionUtils.isEmpty(provizyonVeri)) {
            String exMessage = String.format("Ödeme mektubu gönderme işlemi için gerekli provizyon bilgileri eksiktir. Provizyon ID: %s, Talep ID: %s", provizyonArsiv.getId(), request.getId());
            throw new ValidationException(exMessage);
        }

        List<DocGrupVeri> veriler = new ArrayList<>(provizyonVeri);
        DocVeri docVeri = new DocVeri();
        docVeri.addGrupVeriAll(veriler);
        PikurDocument pd = pikurIslemService.xmlYukle(ihracatciNakitOdemeMektubuPikurXMLPath);
        ByteArrayOutputStream baos = pikurIslemService.pdfDocOlustur(pd, docVeri, PageSize.A4, OrientationRequested.PORTRAIT);
        ExportedFile file = outputAsPDF(baos, this.handleExportFileName(request.getFirstPaymentDate(), request.getLastPaymentDate(), MektupTipEnum.ODEME_MEKTUPLARI));

        ortakMektupIslemlerService.sendDesicionLetterEmail(null, provizyonArsiv, file,  null, request, letterItem,MailTypeEnum.STANDART);
        log.info("islemYapOdemeMektuplariArsiv-Odeme Mektuplari işlenmiştir.{}", provizyonArsiv.getId());
    }


    public String handleExportFileName(LocalDate ilkOdemeTarihi, LocalDate sonOdemeTarihi, MektupTipEnum mektupTip) {
        Date odemeTarihi = Date.from(ilkOdemeTarihi.atStartOfDay(ZoneId.systemDefault()).toInstant());
        Date odemeTarihiSon = Date.from(sonOdemeTarihi.atStartOfDay(ZoneId.systemDefault()).toInstant());

        SimpleDateFormat sdfTarih = new SimpleDateFormat("dd/MM/yyyy");
        String odemeTarihStr = sdfTarih.format(odemeTarihi);
        String odemeTarihSonStr = sdfTarih.format(odemeTarihiSon);

        return odemeTarihStr + "_" + odemeTarihSonStr + "_" + mektupTip.getAdi();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void islemYapOdemeMektuplari(Provizyon provizyon, List<BorcBilgi> borcBilgis, LetterRequest request, LetterItem letterItem) throws Exception {
        log.info("islemYapOdemeMektuplari Odeme Mektuplari işlenmektedir.{}", provizyon.getId());

        if (!isValidProvizyonAndBorcBilgi(provizyon, borcBilgis)) {
            String exMessage = "Ödeme mektubu gönderme işlemi için gerekli ihracatçı bilgileri eksiktir. İhracatçı e-postası veya borç bilgileri bulunamadı";
            throw new ValidationException(exMessage);
        }

        List<DocGrupVeri> provizyonVeri = getOdemeMektupDetayByProvizyon(provizyon);
        if (CollectionUtils.isEmpty(provizyonVeri)) {
            String exMessage = String.format("Ödeme mektubu gönderme işlemi için gerekli provizyon bilgileri eksiktir. Provizyon ID: %s, Talep ID: %s", provizyon.getId(), request.getId());
            throw new ValidationException(exMessage);
        }
        List<DocGrupVeri> veriler = new ArrayList<>(provizyonVeri);
        DocVeri docVeri = new DocVeri();
        docVeri.addGrupVeriAll(veriler);
        PikurDocument pd = pikurIslemService.xmlYukle(ihracatciNakitOdemeMektubuPikurXMLPath);
        ByteArrayOutputStream baos = pikurIslemService.pdfDocOlustur(pd, docVeri, PageSize.A4, OrientationRequested.PORTRAIT);
        ExportedFile file = outputAsPDF(baos, this.handleExportFileName(request.getFirstPaymentDate(), request.getLastPaymentDate(), MektupTipEnum.ODEME_MEKTUPLARI));

        ortakMektupIslemlerService.sendDesicionLetterEmail(provizyon, null, file,  null, request, letterItem,MailTypeEnum.STANDART);

        log.info("islemYapOdemeMektuplari-Odeme Mektuplari işlenmiştir.{}", provizyon.getId());

    }

    private boolean isValidProvizyonAndBorcBilgi(Provizyon provizyon, List<BorcBilgi> borcBilgis) {
        return provizyon != null &&
                provizyon.getIhracatci() != null &&
                StringUtils.isNotEmpty(provizyon.getIhracatci().getEmail()) &&
                CollectionUtils.isNotEmpty(borcBilgis);
    }

    private boolean isValidProvizyonArsivAndBorcBilgiArsiv(ProvizyonArsiv provizyonArsiv, List<BorcBilgiArsiv> borcBilgiArsivs) {
        return provizyonArsiv != null &&
                provizyonArsiv.getIhracatci() != null &&
                StringUtils.isNotEmpty(provizyonArsiv.getIhracatci().getEmail()) &&
                CollectionUtils.isNotEmpty(borcBilgiArsivs);
    }

    public ExportedFile outputAsPDF(ByteArrayOutputStream baos, String dosyaAdi) {
        log.info("outputAsPDF-PDF olarak çıkarma işlemi başladı.");
        ExportedFile file = new ExportedFile();
        byte[] byteArray = baos.toByteArray();
        file.setData(byteArray);
        file.setFileName(dosyaAdi);
        file.setMimeType(ExportedFile.Types.Pdf.mimeType);
        return file;
    }

    public List<DocGrupVeri> getOdemeMektupDetayByProvizyon(Provizyon provizyon) {
        SimpleDateFormat sdfTarih = new SimpleDateFormat("dd/MM/yyyy");
        List<DocGrupVeri> veriler = new ArrayList<>();
        List<DocGrupVeri> borclar = getOdemeMektupBorcBilgileri(provizyon, false);
        if (CollectionUtils.isEmpty(borclar)) {
            return new ArrayList<>();
        }
        DocGrupVeri detayGrup = new DocGrupVeri();
        detayGrup.setGrupAd("DETAY");
        Ihracatci ihracatci = provizyon.getIhracatci();
        detayGrup.addAlanVeri("IHRACATCIADI", ihracatci.getAd());
        String adres1 = ihracatci.getAdres().trim();
        String adres2 = StringUtils.EMPTY;
        String adres3 = StringUtils.EMPTY;
        if (adres1.length() > 50) {
            if (adres1.length() > 100) {
                adres3 = adres1.substring(100);
                adres2 = adres1.substring(50, 100);
            } else {
                adres2 = adres1.substring(50);
                adres1 = adres1.substring(0, 50);
            }
        }

        detayGrup.addAlanVeri("IHRACATCIADRES1", adres1);
        detayGrup.addAlanVeri("IHRACATCIADRES2", adres2);
        detayGrup.addAlanVeri("IHRACATCIADRES3", adres3);
        detayGrup.addAlanVeri("TARIH", sdfTarih.format(new Date()));
        detayGrup.addAlanVeri("KARARNO", provizyon.getKarar().getKararNo());
        String kararAraMetin = "sayılı %s ";
        detayGrup.addAlanVeri("KARARADI", String.format(kararAraMetin, provizyon.getKarar().getAd()));
        detayGrup.addAlanVeri("PROVIZYONTUTAR", provizyon.getTutar());
        detayGrup.addAlanVeri("ODEMETARIH", sdfTarih.format(provizyon.getOdemeTarih()));

        SubeKoduEnum subeKoduEnum = SubeKoduEnum.getById(provizyon.getKarar().getSubeId());
        if (SubeKoduEnum.ANKARA.equals(subeKoduEnum) && !KararTipiEnum.TARIMSAL.equals(KararTipiEnum.getBykod(provizyon.getKarar().getTip()))) {
            subeKoduEnum = SubeKoduEnum.IDARE_MERKEZI;
        }
        detayGrup.addAlanVeri("TCMBSUBEADI", subeKoduEnum != null ? subeKoduEnum.getAdi() : null);

        veriler.add(detayGrup);
        veriler.addAll(borclar);
        return veriler;
    }

    public List<DocGrupVeri> getOdemeMektupDetayByProvizyon(ProvizyonArsiv provizyonArsiv) {
        SimpleDateFormat sdfTarih = new SimpleDateFormat("dd/MM/yyyy");
        List<DocGrupVeri> veriler = new ArrayList<>();
        List<DocGrupVeri> borclar = getOdemeMektupBorcBilgileri(provizyonArsiv, false);
        if (CollectionUtils.isEmpty(borclar)) {
            return new ArrayList<>();
        }
        DocGrupVeri detayGrup = new DocGrupVeri();
        detayGrup.setGrupAd("DETAY");
        Ihracatci ihracatci = provizyonArsiv.getIhracatci();
        detayGrup.addAlanVeri("IHRACATCIADI", ihracatci.getAd());
        String adres1 = ihracatci.getAdres().trim();
        String adres2 = StringUtils.EMPTY;
        String adres3 = StringUtils.EMPTY;
        if (adres1.length() > 50) {
            if (adres1.length() > 100) {
                adres3 = adres1.substring(100);
                adres2 = adres1.substring(50, 100);
            } else {
                adres2 = adres1.substring(50);
                adres1 = adres1.substring(0, 50);
            }
        }

        detayGrup.addAlanVeri("IHRACATCIADRES1", adres1);
        detayGrup.addAlanVeri("IHRACATCIADRES2", adres2);
        detayGrup.addAlanVeri("IHRACATCIADRES3", adres3);
        detayGrup.addAlanVeri("TARIH", sdfTarih.format(new Date()));
        detayGrup.addAlanVeri("KARARNO", provizyonArsiv.getKarar().getKararNo());
        String kararAraMetin = "sayılı %s ";
        detayGrup.addAlanVeri("KARARADI", String.format(kararAraMetin, provizyonArsiv.getKarar().getAd()));
        detayGrup.addAlanVeri("PROVIZYONTUTAR", getProvizyonArsivToplamTutar(provizyonArsiv, false));
        detayGrup.addAlanVeri("ODEMETARIH", sdfTarih.format(provizyonArsiv.getOdemeTarih()));
        SubeKoduEnum subeKoduEnum = SubeKoduEnum.getById(provizyonArsiv.getKarar().getSubeId());
        if (SubeKoduEnum.ANKARA.equals(subeKoduEnum) && !KararTipiEnum.TARIMSAL.equals(KararTipiEnum.getBykod(provizyonArsiv.getKarar().getTip()))) {
            subeKoduEnum = SubeKoduEnum.IDARE_MERKEZI;
        }
        detayGrup.addAlanVeri("TCMBSUBEADI", subeKoduEnum != null ? subeKoduEnum.getAdi() : null);
        veriler.add(detayGrup);
        veriler.addAll(borclar);
        return veriler;
    }

    public BigDecimal getProvizyonArsivToplamTutar(ProvizyonArsiv provizyon, boolean sadeceBorcYazdir) {
        BigDecimal toplamTutar = BigDecimal.ZERO;
        Long provizyonId = provizyon.getId();
        if (provizyonId == null) {
            return toplamTutar;
        }
        List<EftBilgiYonetimArsiv> eftBilgiYonetimList = eftBilgisiYonetimArsivRepository.getEftBilgiYonetimArsivsByProvizyonId(provizyonId);
        Map<BigDecimal, EftBilgiYonetimArsiv> eftBilgiYonetimMap = new HashMap<>();
        for (EftBilgiYonetimArsiv eftBilgiYonetim : eftBilgiYonetimList) {
            eftBilgiYonetimMap.put(new BigDecimal(String.valueOf(eftBilgiYonetim.getBorcBilgiArsiv().getId())), eftBilgiYonetim);
        }
        List<Long> borcIdList = eftBilgiYonetimList.stream().map(EftBilgiYonetimArsiv::getBorcBilgiArsiv).map(BorcBilgiArsiv::getId).sorted().collect(Collectors.toList());
        List<BorcBilgiArsiv> borcBilgiList = borcBilgiService.getBorcBilgiArsivList(provizyon);
        for (Long currentBorcId : borcIdList) {
            BigDecimal borcId = BigDecimal.valueOf(currentBorcId);
            if (sadeceBorcYazdir && borcBilgiList.stream().noneMatch(borcBilgi -> new BigDecimal(borcBilgi.getId()).equals(borcId))) {
                continue;
            }
            EftBilgiYonetimArsiv eftBilgiYonetim = eftBilgiYonetimMap.get(borcId);
            if (eftBilgiYonetim.getKasTarih() == null) {
                continue;
            }
            toplamTutar = toplamTutar.add(eftBilgiYonetim.getTutar());
        }
        return toplamTutar;
    }


    public List<DocGrupVeri> getOdemeMektupBorcBilgileri(Provizyon provizyon, Boolean sadeceBorcYazdir) {

        List<EftBilgiYonetim> eftBilgiYonetimList = eftBilgisiYonetimRepository.getEftBilgiYonetimsByProvizyonId(provizyon.getId());
        if (eftBilgiYonetimList == null || eftBilgiYonetimList.isEmpty()) {
            return new ArrayList<>();
        }
        return eftBilgiYonetimList.stream()
                .filter(eftBilgiYonetim -> eftBilgiYonetim.getKasTarih() != null && !sadeceBorcYazdir)
                .map(eftBilgiYonetim -> {
                    try {
                        return this.odemeMektupDetayBorcHazirla(eftBilgiYonetim);
                    } catch (Exception e) {
                        log.error("OdemeMektupDetayBorcHazirla hatası: " + e.getMessage()); // Hata mesajını logla
                        return null; // veya uygun bir hata değeri döndür
                    }
                }).filter(Objects::nonNull)
                .collect(Collectors.toUnmodifiableList());
    }

    private DocGrupVeri odemeMektupDetayBorcHazirla(EftBilgiYonetim eftBilgiYonetim) throws Exception {

        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        LocalDate localDate = LocalDate.parse(eftBilgiYonetim.getKasTarih(), formatter);
        //MusteriHesabaOdeme eftMesaj = (MusteriHesabaOdeme) eftClientService.getGunlukKasMesajBySorguNoAndOdemeTarihi(eftBilgiYonetim.getKasSorguNo(), localDate);

        DocGrupVeri detayBorclar = new DocGrupVeri();
        detayBorclar.setGrupAd("BORCBILGILERI");

        /*if (eftBilgiYonetim.getBorcBilgi() != null && BorcTipEnum.SGK.getKod().equals(eftBilgiYonetim.getBorcBilgi().getBorcTipi())) {
            BorcBilgi borcBilgi = eftBilgiYonetim.getBorcBilgi();
            detayBorclar.addAlanVeri("BORCALICISI", borcBilgi.getAliciAdi());
            detayBorclar.addAlanVeri("BORCTUTARI", borcBilgi.getTutar());

        } else {
            detayBorclar.addAlanVeri("BORCALICISI", eftMesaj.getAlAd());
            detayBorclar.addAlanVeri("BORCTUTARI", new BigDecimal(StringUtil.formatVirgulToNokta(eftMesaj.getTtr())));
        }*/

        //todo
        if (eftBilgiYonetim.getBorcBilgi() != null && BorcTipEnum.SGK.getKod().equals(eftBilgiYonetim.getBorcBilgi().getBorcTipi())) {
            BorcBilgi borcBilgi = eftBilgiYonetim.getBorcBilgi();
            detayBorclar.addAlanVeri("BORCALICISI", borcBilgi.getAliciAdi());
            detayBorclar.addAlanVeri("BORCTUTARI", borcBilgi.getTutar());

        } else {
            detayBorclar.addAlanVeri("BORCALICISI", "test");
            detayBorclar.addAlanVeri("BORCTUTARI", new BigDecimal(1));
        }

        /*String eftBankaKoduAdi = eftMesaj.getAlKK() + "-"
                + bankaSubeService.getBankaForBankaKodu(eftMesaj.getAlKK()).getAd();*/

        //todo
        String eftBankaKoduAdi = "test";



        StringBuilder sb = new StringBuilder(eftBankaKoduAdi.trim());
        if (sb.length() > 30) {
            sb.setLength(30);
        }
        /*detayBorclar.addAlanVeri("EFTBANKAKODUADI", sb.toString());
        detayBorclar.addAlanVeri("EFTHESAP", eftMesaj.getAlHesN());
        detayBorclar.addAlanVeri("EFTTARIHI", eftMesaj.getTrh());
        detayBorclar.addAlanVeri("EFTSORGUNO", eftMesaj.getSN());
        detayBorclar.addAlanVeri("EFTACIKLAMA", eftMesaj.getAcklm());*/

        detayBorclar.addAlanVeri("EFTBANKAKODUADI", sb.toString());
        detayBorclar.addAlanVeri("EFTHESAP", "test");
        detayBorclar.addAlanVeri("EFTTARIHI", "test");
        detayBorclar.addAlanVeri("EFTSORGUNO", "test");
        detayBorclar.addAlanVeri("EFTACIKLAMA", "test");


        return detayBorclar;
    }

    public List<DocGrupVeri> getOdemeMektupBorcBilgileri(ProvizyonArsiv provizyon, Boolean sadeceBorcYazdir) {

        List<EftBilgiYonetimArsiv> eftBilgiYonetimList = eftBilgisiYonetimArsivRepository.getEftBilgiYonetimArsivsByProvizyonId(provizyon.getId());
        if (eftBilgiYonetimList == null || eftBilgiYonetimList.isEmpty()) {
            return new ArrayList<>();
        }
        return eftBilgiYonetimList.stream()
                .filter(eftBilgiYonetim -> eftBilgiYonetim.getKasTarih() != null && !sadeceBorcYazdir)
                .map(eftBilgiYonetim -> {
                    try {
                        return this.odemeMektupDetayBorcHazirlaArsiv(eftBilgiYonetim);
                    } catch (Exception e) {
                        System.err.println("OdemeMektupDetayBorcHazirla-arsiv hatası: " + e.getMessage()); // Hata mesajını logla
                        return null; // veya uygun bir hata değeri döndür
                    }
                }).filter(Objects::nonNull)
                .collect(Collectors.toUnmodifiableList());
    }

    private DocGrupVeri odemeMektupDetayBorcHazirlaArsiv(EftBilgiYonetimArsiv eftBilgiYonetimArsiv) throws Exception {

        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        LocalDate localDate = LocalDate.parse(eftBilgiYonetimArsiv.getKasTarih(), formatter);
        //MusteriHesabaOdeme eftMesaj = (MusteriHesabaOdeme) eftClientService.getGunlukKasMesajBySorguNoAndOdemeTarihi(eftBilgiYonetimArsiv.getKasSorguNo(), localDate);

        DocGrupVeri detayBorclar = new DocGrupVeri();
        detayBorclar.setGrupAd("BORCBILGILERI");

        /*if (eftBilgiYonetimArsiv.getBorcBilgiArsiv() != null && BorcTipEnum.SGK.getKod().equals(eftBilgiYonetimArsiv.getBorcBilgiArsiv().getBorcTipi())) {
            BorcBilgiArsiv borcBilgiArsiv = eftBilgiYonetimArsiv.getBorcBilgiArsiv();
            detayBorclar.addAlanVeri("BORCALICISI", borcBilgiArsiv.getAliciAdi());
            detayBorclar.addAlanVeri("BORCTUTARI", borcBilgiArsiv.getTutar());
        } else {
            detayBorclar.addAlanVeri("BORCALICISI", eftMesaj.getAlAd());
            detayBorclar.addAlanVeri("BORCTUTARI", new BigDecimal(StringUtil.formatVirgulToNokta(eftMesaj.getTtr())));
        }*/


            detayBorclar.addAlanVeri("BORCALICISI", "test");
            detayBorclar.addAlanVeri("BORCTUTARI", new BigDecimal(1));


        /*String eftBankaKoduAdi = eftMesaj.getAlKK() + "-"
                + bankaSubeService.getBankaForBankaKodu(eftMesaj.getAlKK()).getAd();*/
        String eftBankaKoduAdi = "test";

        StringBuilder sb = new StringBuilder(eftBankaKoduAdi.trim());
        if (sb.length() > 30) {
            sb.setLength(30);
        }
        /*detayBorclar.addAlanVeri("EFTBANKAKODUADI", sb.toString());
        detayBorclar.addAlanVeri("EFTHESAP", eftMesaj.getAlHesN());
        detayBorclar.addAlanVeri("EFTTARIHI", eftMesaj.getTrh());
        detayBorclar.addAlanVeri("EFTSORGUNO", eftMesaj.getSN());
        detayBorclar.addAlanVeri("EFTACIKLAMA", eftMesaj.getAcklm());*/

        detayBorclar.addAlanVeri("EFTBANKAKODUADI", "test");
        detayBorclar.addAlanVeri("EFTHESAP", "test");
        detayBorclar.addAlanVeri("EFTTARIHI", "test");
        detayBorclar.addAlanVeri("EFTSORGUNO", "test");
        detayBorclar.addAlanVeri("EFTACIKLAMA", "test");

        return detayBorclar;
    }


    @Override
    public UUID handleInitialLetterRequestTransaction(KararTipiEnum belgeTip,
                                                      Integer belgeNo,
                                                      Integer belgeYil,
                                                      String kararNo,
                                                      LocalDate ilkOdemeTarih,
                                                      LocalDate sonOdemeTarih,
                                                      String vkn,
                                                      String tckn,
                                                      MektupTipEnum mektupTip) throws Exception {
        LetterRequestDto dto = new LetterRequestDto();
        dto.setRequestTypeId(String.valueOf(MektupTipEnum.convertMektupTipToRequestTypeId(mektupTip)));
        dto.setFirstPaymentDate(String.valueOf(ilkOdemeTarih));
        dto.setLastPaymentDate(String.valueOf(sonOdemeTarih));
        dto.setTahakkukTuru(belgeTip != null ? belgeTip.name() : null);
        dto.setBelgeNo(belgeNo != null ? belgeNo.toString() : null);
        dto.setYil(belgeYil != null ? belgeYil.toString() : null);
        dto.setKararNoAdi(kararNo);
        dto.setVkn(vkn);
        dto.setTckn(tckn);
        dto.setScopeValue(vkn != null ? vkn : tckn);

        String userSicil = SAMUtils.getSimdikiKullaniciSicili();
        String subeId = kullaniciBilgileriService.getKullaniciSubeId();

        // Request kaydetme
        return handleRequest(dto, userSicil, subeId);
    }


    @Override
    public LetterRequestListePageDTO handleGetLetterRequestDtoTransaction(
            int activePage, int pageSize, KararTipiEnum belgeTip,
            Integer belgeNo,
            Integer belgeYil,
            String kararNo,
            LocalDate ilkOdemeTarih,
            LocalDate sonOdemeTarih,
            String vkn,
            String tckn,
            MektupTipEnum mektupTip) throws Exception {

        log.debug("handleGetLetterRequestDtoTransaction called: belgeTip={}, belgeNo={}, belgeYil={}, kararNo={}, ilkOdemeTarih={}, sonOdemeTarih={}, vkn={}, tckn={}, mektupTip={}",
                belgeTip, belgeNo, belgeYil, kararNo, ilkOdemeTarih, sonOdemeTarih, vkn, tckn, mektupTip);

        // --- 0) Veriyi çek
        final List<LetterRequest> all =
                letterRequestTransactionService.listLetterRequest(ilkOdemeTarih, sonOdemeTarih,
                        belgeTip, belgeNo, belgeYil, kararNo, vkn, tckn, mektupTip);

        if (all == null || all.isEmpty()) {
            log.warn("letterRequestList is empty or null. Returning empty list.");
            return new LetterRequestListePageDTO(new ArrayList<>(), 0, 1, Sort.unsorted());
        }


        final int totalSize = all.size();
        final int totalPage = (int) Math.ceil(totalSize / (double) Math.max(pageSize, 1));
        if (activePage < 1 || activePage > totalPage) activePage = 1;

        final int start = (activePage - 1) * pageSize;
        final int end = Math.min(start + pageSize, totalSize);
        final List<LetterRequest> page = all.subList(start, end);

        List<UUID> pageIds = page.stream()
                .map(LetterRequest::getId)
                .collect(Collectors.toList());

        Map<UUID, List<LetterItem>> itemsByRequestId =
                letterRequestTransactionService.loadItemByLetterRequestIds(pageIds);

        // --- 2) Paralel dönüşüm: daha güvenli CF kullanımı
        final Duration perTaskTimeout = Duration.ofMillis(perTaskTimeoutMs);
        final Duration globalTimeout = Duration.ofMillis(globalTimeoutMs);

        List<CompletableFuture<LetterRequestDto>> futures = page.stream()
                .map(lr -> CompletableFuture.supplyAsync(() -> {
                            // DTO kurulum
                            log.debug("Mapping LetterRequest to LetterRequestDto. LetterRequest ID: {}", lr.getId());

                            LetterRequestDto dto = new LetterRequestDto();
                            dto.setRequestTypeId(MektupTipEnum.convertRequestTypeIdToMektupTip(lr.getRequestTypeId()).getAdi());
                            dto.setTalepDurum(Optional.ofNullable(LetterStatusEnum.getByKod(String.valueOf(lr.getStatusId())))
                                    .map(LetterStatusEnum::getAdi)
                                    .orElse(null));

                            try {
                                letterRequestConverter.doConvertToEntity(lr, dto);
                            } catch (ParseException e) {
                                log.error("Mektup isteği dönüştürme hatası (id={}): {}", lr.getId(), e.getMessage(), e);
                                throw new RuntimeException("Failed to convert letterRequestDTO to entity", e);
                            }

                            // Item'lar
                            log.debug("Getting LetterItems for LetterRequest ID: {}", lr.getId());
                            List<LetterItemDTO> itemDtos = itemsByRequestId
                                    .getOrDefault(lr.getId(), List.of())
                                    .stream()
                                    .map(li -> {
                                        log.debug("Mapping LetterItem to LetterItemDTO. LetterItem ID: {}", li.getId());
                                        LetterItemDTO lidto = new LetterItemDTO();
                                        lidto.setStatus(Optional.ofNullable(LetterStatusEnum.getByKod(String.valueOf(li.getStatusId())))
                                                .map(LetterStatusEnum::getAdi)
                                                .orElse(null));
                                        letterItemConverter.doConvertToDto(lidto, li);
                                        lidto.setNotifyLogs(this.preparedNotifyLogDto(li));
                                        return lidto;
                                    })
                                    .collect(Collectors.toList());

                            dto.setItemDTOList(itemDtos);
                            return dto;

                        }, letterReqExecutor)
                        // her iş için per-task timeout
                        .orTimeout(perTaskTimeout.toMillis(), TimeUnit.MILLISECONDS)
                        // task özelinde hata yeme: null dön, kısmi başarıya izin ver
                        .exceptionally(ex -> {
                            Throwable root = (ex instanceof CompletionException && ex.getCause() != null) ? ex.getCause() : ex;
                            log.error("Async task failed (skipping). cause={}", root.toString(), root);
                            return null;
                        }))
                .collect(Collectors.toList());

        // Global timeout + kısmi başarı toplama
        try {
            CompletableFuture
                    .allOf(futures.toArray(CompletableFuture[]::new))
                    .orTimeout(globalTimeout.toMillis(), TimeUnit.MILLISECONDS)
                    .join();
        } catch (Throwable t) {
            log.warn("Parallel block timed out/failed, will collect partial results. cause={}", t.toString());
            // kalanları iptal et
            futures.forEach(f -> {
                if (!f.isDone()) f.cancel(true);
            });
        }

        // Sadece başarıyla bitenleri al
        List<LetterRequestDto> pageResult = futures.stream()
                .filter(f -> f.isDone() && !f.isCompletedExceptionally() && !f.isCancelled())
                .map(CompletableFuture::join)
                .filter(Objects::nonNull)
                //.sorted(Comparator.comparing(LetterRequestDto::getSorguTarihi, Comparator.naturalOrder()))
                .collect(Collectors.toList());

        if (pageResult.size() != page.size()) {
            log.warn("Partial success on page {}: expected {} got {}", activePage, page.size(), pageResult.size());
        }

        log.debug("handleGetLetterRequestDtoTransaction completed. page={} size={} out={}",
                activePage, pageSize, pageResult.size());

        // --- 4) Response (toplam boyut/sayfa bilgisi orijinal sözleşmeye uygun)
        return new LetterRequestListePageDTO(pageResult, totalSize, totalPage, Sort.unsorted());
    }

    private List<LetterNotifyLogDTO> preparedNotifyLogDto(LetterItem letterItem) {
        log.info("preparedNotifyLogDto method called with parameters: letterItem={}", letterItem);
        //prepared-notifylog
        return letterNotificationLogService.getLetterNotificationLogRecords(letterItem.getRequestId().toString(),
                        letterItem.getId())
                .stream()
                .map(letterNotificationLog -> {
                    LetterNotifyLogDTO notifyLogDTO = new LetterNotifyLogDTO();
                    letterNotificationLogConverterService.doConvertToDto(notifyLogDTO, letterNotificationLog);
                    return notifyLogDTO;

                }).collect(Collectors.toList());
    }


}




//25082025
package tr.gov.tcmb.ogmdfif.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tr.gov.tcmb.ogmdfif.model.entity.LetterAttempt;
import tr.gov.tcmb.ogmdfif.model.entity.LetterItem;
import tr.gov.tcmb.ogmdfif.model.entity.LetterRequest;
import tr.gov.tcmb.ogmdfif.repository.LetterAttemptRepository;
import tr.gov.tcmb.ogmdfif.repository.LetterItemRepository;
import tr.gov.tcmb.ogmdfif.repository.LetterRequestRepository;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class LetterJobTxService {

    private static final int BATCH_FLUSH_SIZE = 100;

    private final LetterRequestRepository requestRepo;
    private final LetterItemRepository itemRepo;
    private final LetterAttemptRepository attemptRepo;

    @PersistenceContext
    private EntityManager em;

    /* ------------------- REQUEST METOTLARI ------------------- */

    /** İşlemeye hazır request’leri bul */
    @Transactional(readOnly = true)
    public List<LetterRequest> findReadyDue(int limit) {
        return requestRepo.findReadyDue(limit);
    }

    /** Request’i başka worker alamasın diye claim et */
    @Transactional(propagation = Propagation.REQUIRED)
    public boolean claimRequest(UUID requestId) {
        return requestRepo.markProcessing(requestId) > 0;
    }

    /** Request final durumunu güncelle */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void finishRequest(UUID requestId, short statusId, String errorCode, String errorMessage) {
        requestRepo.finishRequest(requestId, statusId, errorCode, errorMessage);
    }

    /* ------------------- ITEM METOTLARI ------------------- */

    /** Request’e ait tüm item’ları getir */
    @Transactional(readOnly = true)
    public List<LetterItem> getItems(UUID requestId) {
        return itemRepo.findAllByRequestId(requestId);
    }

    /** Request’e ait item ID’lerini getir */
    @Transactional(readOnly = true)
    public List<UUID> getItemIds(UUID requestId) {
        return itemRepo.findIdsByRequestId(requestId);
    }

    /** Tek item’in mevcut status id’sini getir */
    @Transactional(readOnly = true)
    public Short getStatusId(UUID itemId) {
        return itemRepo.getStatusId(itemId);
    }

    /** Tek item’in attempt sayısını getir */
    @Transactional(readOnly = true)
    public Short getAttemptCount(UUID itemId) {
        return itemRepo.getAttemptCount(itemId);
    }

    /** Yeni item ekle */
    @Transactional
    public void insertItemIfNotExists(UUID id, UUID requestId, String receiverKey, String receiverValue) {
        itemRepo.insertIfNotExists(id, requestId, receiverKey, receiverValue);
    }

    /** Toplu item ekleme */
    @Transactional
    public void insertLetterItemsBatch(final UUID requestId, final Map<String, String> receivers) {
        int i = 0;
        for (Map.Entry<String, String> entry : receivers.entrySet()) {
            final UUID itemId = UUID.randomUUID();
            insertItemIfNotExists(itemId, requestId, entry.getKey(), entry.getValue());

            if ((++i % BATCH_FLUSH_SIZE) == 0) {
                em.flush();
                em.clear();
            }
        }
        em.flush();
        em.clear();
    }

    /** Item durumunu güncelle */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void updateItemStatus(UUID itemId, short statusId, short attemptCount,
                                 String errorCode, String errorMessage) {
        itemRepo.updateStatus(itemId, statusId, attemptCount, errorCode, errorMessage);
    }

    /* ------------------- ATTEMPT METOTLARI ------------------- */

    /** Attempt log kaydı ekle */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logAttempt(UUID id,
                           UUID requestId,
                           UUID itemId,
                           short attemptNo,
                           OffsetDateTime startedAt,
                           OffsetDateTime finishedAt,
                           int durationMs,
                           String result,
                           String errorCode,
                           String errorMessage) {
        attemptRepo.insertAttempt(id, requestId, itemId, attemptNo, startedAt, finishedAt,
                durationMs, result, errorCode, errorMessage);
    }

    /* ------------------- İSTATİSTİK METOTLARI ------------------- */

    @Transactional(readOnly = true)
    public long countAllItems(UUID requestId) {
        return requestRepo.countAllItems(requestId);
    }

    @Transactional(readOnly = true)
    public long countSentItems(UUID requestId) {
        return requestRepo.countSent(requestId);
    }

    @Transactional(readOnly = true)
    public long countFailedItems(UUID requestId) {
        return requestRepo.countFailed(requestId);
    }

    /* ------------------- GERİYE DÖNÜK METOT ------------------- */

    @Transactional(readOnly = true)
    public List<LetterItem> findAllByLetterRequestIds(List<UUID> requestIds) {
        return itemRepo.findAllByLetterRequestIds(requestIds);
    }
}


+++
package tr.gov.tcmb.ogmdfif.service.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tr.gov.tcmb.ogmdfif.constant.LetterStatusEnum;
import tr.gov.tcmb.ogmdfif.model.entity.LetterItem;
import tr.gov.tcmb.ogmdfif.model.entity.LetterRequest;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class LetterProcessingJob {

    private static final int PICK_LIMIT = 20;
    private static final int MAX_RETRY  = 3;

    private final LetterJobTxService txService;
    private final LetterItemTxService itemTxService;

    @Scheduled(fixedDelayString = "PT1M") // 1 dakika
    // @SchedulerLock(name = "letterProcessingJob", lockAtLeastFor = "PT20S", lockAtMostFor = "PT5M")
    public void runBatch() {
        List<LetterRequest> candidates = txService.findReadyDue(PICK_LIMIT);
        if (candidates == null || candidates.isEmpty()) {
            log.debug("No READY requests to process.");
            return;
        }
        log.info("Picked {} request(s) to process", candidates.size());

        for (LetterRequest r : candidates) {
            try {
                processOneRequestSafe(r);
            } catch (Exception e) {
                log.error("Unexpected error while processing request {}", r.getId(), e);
            }
        }
    }

    /**
     * Üst seviyede transaction yok: stale snapshot/persistence context tutmayalım.
     * Alt seviyede REQUIRES_NEW ile item/attempt işlemleri bağımsız ilerler.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void processOneRequestSafe(LetterRequest r) {
        if (!txService.claimRequest(r.getId())) {
            log.info("Request {} already claimed by another worker.", r.getId());
            return;
        }

        long start = System.currentTimeMillis();

        // Entity listesi alınabilir; NOT_SUPPORTED olduğu için burada managed context yok.
        List<LetterItem> items = txService.getItems(r.getId());
        if (items != null) {
            for (LetterItem item : items) {
                // Kararı detached entity'ye göre değil, DB'ye göre ver
                Short statusId = txService.getStatusId(item.getId());
                if (statusId != null && (statusId == 6 || statusId == 7)) {
                    continue; // final durumdaysa atla
                }
                processOneItemWithRetry(r, item); // item nesnesini gönderiyoruz
            }
        }

        // Request final durumunu DB'den taze sayımla güncelle
        updateRequestFinalStatus(r.getId(), start);
    }

    public void processOneItemWithRetry(LetterRequest req, LetterItem item) {
        Short attemptsDb = txService.getAttemptCount(item.getId());
        short currentAttempts = attemptsDb == null ? (short) 0 : attemptsDb;

        for (short attemptNo = (short) (currentAttempts + 1); attemptNo <= MAX_RETRY; attemptNo++) {
            OffsetDateTime started = OffsetDateTime.now();
            long t0 = System.currentTimeMillis();
            String errCode = null, errMsg = null;
            String result  = "SUCCESS";

            try {
                // Her deneme LetterItemTxService içinde REQUIRES_NEW transaction ile çalışır
                itemTxService.processSingleAttempt(req, item);
            } catch (Exception e) {
                result  = "FAIL";
                errCode = e.getClass().getSimpleName();
                errMsg  = safeMsg(e.getMessage());
            }

            int duration = (int) (System.currentTimeMillis() - t0);
            itemTxService.saveAttemptLog(req.getId(), item.getId(), attemptNo, started, duration, result, errCode, errMsg);

            if ("SUCCESS".equals(result)) {
                // 6 = SENT / SUCCESS
                itemTxService.updateItemStatus(item.getId(), (short) 6, attemptNo, null, null);
                return;
            } else {
                boolean lastTry = (attemptNo == MAX_RETRY);

                // Ara denemede pending/processing'i koru; son denemede FINAL_FAIL (7)
                Short cur = txService.getStatusId(item.getId()); // DB’den taze oku
                short nextStatus = lastTry ? (short) 7 : (cur == null || cur == 0 ? 1 : cur); // 1 = PROCESSING/RETRY

                itemTxService.updateItemStatus(item.getId(), nextStatus, attemptNo, errCode, errMsg);

                if (lastTry) {
                    return; // final fail oldu
                }
            }
        }
    }

    /**
     * Final kuralı:
     * - total==0  -> NO_ITEMS
     * - sent==total -> SENT
     * - fail==total -> ALL_FAILED
     * - sent+fail==total -> PARTIAL_SENT
     * - aksi halde -> PROCESSING (pending var)
     */
    private void updateRequestFinalStatus(UUID requestId, long startMillis) {
        long total = txService.countAllItems(requestId);
        long sent  = txService.countSentItems(requestId);
        long fail  = txService.countFailedItems(requestId);

        short status;
        String code;
        String msg = null;

        if (total == 0) {
            status = Short.parseShort(LetterStatusEnum.NO_ITEMS.getKod());
            code   = LetterStatusEnum.NO_ITEMS.getAdi();
            msg    = "Taleple ilgili detay kayıt bulunmamaktadır.";
        } else if (sent == total) {
            status = Short.parseShort(LetterStatusEnum.SENT.getKod());
            code   = LetterStatusEnum.SENT.name();
        } else if (fail == total) {
            status = Short.parseShort(LetterStatusEnum.ALL_FAILED.getKod());
            code   = LetterStatusEnum.ALL_FAILED.name();
            msg    = String.format("%d detay kayıt başarısızlıkla sonuçlandı. (Tümü)", total);
        } else if (sent + fail == total) {
            status = Short.parseShort(LetterStatusEnum.PARTIAL_SENT.getKod());
            code   = LetterStatusEnum.PARTIAL_SENT.getAdi();
            msg    = String.format("%d/%d detay kayıt başarısızlıkla sonuçlandı.", fail, total);
        } else {
            status = Short.parseShort(LetterStatusEnum.PROCESSING.getKod());
            code   = LetterStatusEnum.PROCESSING.getAdi();
        }

        txService.finishRequest(requestId, status, code, msg);
        log.info("Request {} finished in {} ms → status={}, sent/fail/total={}/{}/{}",
                requestId, (System.currentTimeMillis() - startMillis), status, sent, fail, total);
    }

    private String safeMsg(String s) {
        if (s == null) return null;
        return s.length() > 4000 ? s.substring(0, 4000) : s;
    }
}


+++
package tr.gov.tcmb.ogmdfif.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tr.gov.tcmb.ogmdfif.model.entity.LetterItem;

import java.util.List;
import java.util.UUID;

@Repository
public interface LetterItemRepository extends JpaRepository<LetterItem, UUID> {

    /* --- Mevcut (entity bazlı) --- */
    @Query(value = "SELECT * FROM ogmdfifodm.tletter_item WHERE request_id = :requestId", nativeQuery = true)
    List<LetterItem> findAllByRequestId(@Param("requestId") UUID requestId);

    /* --- ID ile dolaşmak için hafif sorgular --- */
    @Query(value = "SELECT id FROM ogmdfifodm.tletter_item WHERE request_id = :requestId", nativeQuery = true)
    List<UUID> findIdsByRequestId(@Param("requestId") UUID requestId);

    @Query(value = "SELECT attempt_count FROM ogmdfifodm.tletter_item WHERE id = :itemId", nativeQuery = true)
    Short getAttemptCount(@Param("itemId") UUID itemId);

    @Query(value = "SELECT status_id FROM ogmdfifodm.tletter_item WHERE id = :itemId", nativeQuery = true)
    Short getStatusId(@Param("itemId") UUID itemId);

    /* --- Ekleme: gerçekten 'if not exists' olsun --- */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value =
            "INSERT INTO ogmdfifodm.tletter_item " +
            "(id, request_id, receiver_key, payload_ref, status_id, attempt_count, created_at, updated_at) " +
            "VALUES (:id, :requestId, :receiverKey, :payloadRef, 1, 0, now(), now()) " +
            "ON CONFLICT (id) DO NOTHING",
            nativeQuery = true)
    int insertIfNotExists(@Param("id") UUID id,
                          @Param("requestId") UUID requestId,
                          @Param("receiverKey") String receiverKey,
                          @Param("payloadRef") String payloadRef);

    /* --- Durum güncelleme: ara/son deneme bilgileri anında görünür olsun --- */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value =
            "UPDATE ogmdfifodm.tletter_item " +
            "SET status_id = :statusId, " +
            "attempt_count = :attemptCount, " +
            "last_error_code = :errorCode, " +
            "last_error_message = :errorMessage, " +
            "sent_at = CASE WHEN :statusId = 6 THEN now() ELSE sent_at END, " +
            "updated_at = now() " +
            "WHERE id = :itemId",
            nativeQuery = true)
    int updateStatus(@Param("itemId") UUID itemId,
                     @Param("statusId") short statusId,
                     @Param("attemptCount") short attemptCount,
                     @Param("errorCode") String errorCode,
                     @Param("errorMessage") String errorMessage);

    /* --- Mevcut (liste) --- */
    @Query("select li from LetterItem li where li.requestId in :letterRequestIds")
    List<LetterItem> findAllByLetterRequestIds(@Param("letterRequestIds") List<UUID> letterRequestIds);
}


///


package tr.gov.tcmb.ogmdfif.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import tr.gov.tcmb.ogmdfif.model.entity.LetterItem;

import java.util.List;
import java.util.UUID;


@Repository
public interface LetterItemRepository extends JpaRepository<LetterItem, UUID> {

    @Query(value = "SELECT * FROM ogmdfifodm.tletter_item WHERE request_id = :requestId", nativeQuery = true)
    java.util.List<LetterItem> findAllByRequestId(@Param("requestId") UUID requestId);

    @Modifying
    @Query(value = "INSERT INTO ogmdfifodm.tletter_item(id,request_id, receiver_key, payload_ref, status_id, attempt_count, created_at, updated_at) " +
            "VALUES (:id, :requestId, :receiverKey, :payloadRef, 1, 0, now(), now()) ", nativeQuery = true)
    void insertIfNotExists(@Param("id") UUID id,
            @Param("requestId") UUID requestId,
                           @Param("receiverKey") String receiverKey,
                           @Param("payloadRef") String payloadRef);


    @Modifying
    @Query(value = "UPDATE ogmdfifodm.tletter_item " +
            "SET status_id = :statusId, " +
            "attempt_count = :attemptCount, " +
            "last_error_code = :errorCode, " +
            "last_error_message = :errorMessage, " +
            "sent_at = CASE WHEN :statusId = 6 THEN now() ELSE sent_at END, " +
            "updated_at = now() " +
            "WHERE id = :itemId", nativeQuery = true)
    void updateStatus(@Param("itemId") UUID itemId,
                     @Param("statusId") short statusId,
                     @Param("attemptCount") short attemptCount,
                     @Param("errorCode") String errorCode,
                     @Param("errorMessage") String errorMessage);

    @Query("select li from LetterItem li where li.requestId in :letterRequestIds")
    List<LetterItem> findAllByLetterRequestIds(@Param("letterRequestIds") List<UUID> letterRequestIds);
}


77///
package tr.gov.tcmb.ogmdfif.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tr.gov.tcmb.ogmdfif.model.entity.LetterItem;
import tr.gov.tcmb.ogmdfif.model.entity.LetterRequest;
import tr.gov.tcmb.ogmdfif.repository.LetterAttemptRepository;
import tr.gov.tcmb.ogmdfif.repository.LetterItemRepository;
import tr.gov.tcmb.ogmdfif.repository.LetterRequestRepository;

import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class LetterJobTxService {

    private static final int BATCH_FLUSH_SIZE = 100;

    private final LetterRequestRepository requestRepo;
    private final LetterItemRepository itemRepo;
    private final LetterAttemptRepository attemptRepo;

    @PersistenceContext
    private EntityManager em;

    /* ---------- READ & PICK ---------- */

    @Transactional(readOnly = true)
    public List<LetterRequest> findReadyDue(int limit) {
        return requestRepo.findReadyDue(limit);
    }

    /** Request’i tek işleyicinin alması için claim */
    @Transactional(propagation = Propagation.REQUIRED)
    public boolean claimRequest(UUID requestId) {
        return requestRepo.markProcessing(requestId) > 0;
    }

    /* ---------- ITEM LISTELEME: ID İLE ÇALIŞ ---------- */

    /** Request’e ait item ID’lerini döndür (entity yok, stale yok) */
    @Transactional(readOnly = true)
    public List<UUID> getItemIds(UUID requestId) {
        return itemRepo.findIdsByRequestId(requestId);
    }

    /** Item’ın mevcut attempt sayısı – DB’den taze oku */
    @Transactional(readOnly = true)
    public Short getAttemptCount(UUID itemId) {
        return itemRepo.getAttemptCount(itemId);
    }

    /** Item’ın statusId – DB’den taze oku */
    @Transactional(readOnly = true)
    public Short getStatusId(UUID itemId) {
        return itemRepo.getStatusId(itemId);
    }

    /* ---------- ITEM OLUŞTURMA / BATCH ---------- */

    @Transactional
    public void insertItemIfNotExists(UUID id, UUID requestId, String receiverKey, String receiverValue) {
        itemRepo.insertIfNotExists(id, requestId, receiverKey, receiverValue);
    }

    @Transactional
    public void insertLetterItemsBatch(final UUID requestId, final Map<String, String> receivers) {
        int i = 0;
        for (Map.Entry<String, String> entry : receivers.entrySet()) {
            final UUID itemId = UUID.randomUUID();
            insertItemIfNotExists(itemId, requestId, entry.getKey(), entry.getValue());

            if ((++i % BATCH_FLUSH_SIZE) == 0) {
                em.flush();
                em.clear();
            }
        }
        em.flush();
        em.clear();
    }

    /* ---------- ITEM DURUM & LOG: REQUIRES_NEW ---------- */

    /** Item durumunu bağımsız transaction’da yaz (retry/ara-commit görünür olsun) */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void updateItemStatus(UUID itemId, short statusId, short attemptCount,
                                 String errorCode, String errorMessage) {
        itemRepo.updateStatus(itemId, statusId, attemptCount, errorCode, errorMessage);
    }

    /** Attempt log’unu bağımsız transaction’da yaz (rollback’ten etkilenmesin) */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logAttempt(UUID id, UUID requestId, UUID itemId, short attemptNo,
                           OffsetDateTime startedAt, OffsetDateTime finishedAt, int durationMs,
                           String result, String errorCode, String errorMessage) {
        attemptRepo.insertAttempt(id, requestId, itemId, attemptNo, startedAt, finishedAt,
                                  durationMs, result, errorCode, errorMessage);
    }

    /* ---------- REQUEST FİNAL ---------- */

    /** Final durumu bağımsız transaction’da yaz – UI hemen doğru görsün */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void finishRequest(UUID requestId, short statusId, String errorCode, String errorMessage) {
        requestRepo.finishRequest(requestId, statusId, errorCode, errorMessage);
    }

    /* ---------- SAYIMLAR (FINAL HESAPLAMA İÇİN) ---------- */

    @Transactional(readOnly = true)
    public long countAllItems(UUID requestId) {
        return requestRepo.countAllItems(requestId);
    }

    @Transactional(readOnly = true)
    public long countSentItems(UUID requestId) {
        return requestRepo.countSent(requestId);
    }

    @Transactional(readOnly = true)
    public long countFailedItems(UUID requestId) {
        return requestRepo.countFailed(requestId);
    }

    /* ---------- (Opsiyonel) Geriye dönük method – gerekiyorsa kalsın ---------- */

    @Transactional(readOnly = true)
    public List<LetterItem> findAllByLetterRequestIds(List<UUID> requestIds) {
        return itemRepo.findAllByLetterRequestIds(requestIds);
    }
}



/////7
package tr.gov.tcmb.ogmdfif.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tr.gov.tcmb.ogmdfif.model.entity.LetterAttempt;
import tr.gov.tcmb.ogmdfif.model.entity.LetterItem;
import tr.gov.tcmb.ogmdfif.model.entity.LetterRequest;
import tr.gov.tcmb.ogmdfif.repository.LetterAttemptRepository;
import tr.gov.tcmb.ogmdfif.repository.LetterItemRepository;
import tr.gov.tcmb.ogmdfif.repository.LetterRequestRepository;


import javax.persistence.EntityManager;
import javax.persistence.PersistenceContext;
import java.time.OffsetDateTime;
import java.util.List;

import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class LetterJobTxService {

    private static final int BATCH_FLUSH_SIZE = 100;
    private final LetterRequestRepository requestRepo;
    private final LetterItemRepository itemRepo;
    private final LetterAttemptRepository attemptRepo;

    @PersistenceContext
    private EntityManager em;

    @Transactional(readOnly = true)
    public List<LetterRequest> findReadyDue(int limit) {
        return requestRepo.findReadyDue(limit);
    }

    @Transactional
    public boolean claimRequest(UUID requestId) {
        return requestRepo.markProcessing(requestId) > 0;
    }

    @Transactional
    public void insertItemIfNotExists(UUID id,UUID requestId, String receiverKey, String receiverValue) {
        itemRepo.insertIfNotExists(id,requestId, receiverKey, receiverValue);
    }

    @Transactional
    public List<LetterItem> getItems(UUID requestId) {
        return itemRepo.findAllByRequestId(requestId);
    }

    @Transactional
    public void updateItemStatus(UUID itemId, short statusId, short attemptCount, String errorCode, String errorMessage) {
        itemRepo.updateStatus(itemId, statusId, attemptCount, errorCode, errorMessage);
    }

    @Transactional
    public void logAttempt(UUID id,UUID requestId, UUID itemId, short attemptNo,
                           OffsetDateTime startedAt, OffsetDateTime finishedAt, int durationMs,
                           String result, String errorCode, String errorMessage) {
        attemptRepo.insertAttempt(id,requestId, itemId, attemptNo, startedAt, finishedAt, durationMs, result, errorCode, errorMessage);
    }

    @Transactional
    public void finishRequest(UUID requestId, short statusId, String errorCode, String errorMessage) {
        requestRepo.finishRequest(requestId, statusId, errorCode, errorMessage);
    }

    @Transactional(readOnly = true)
    public long countAllItems(UUID requestId) {
        return requestRepo.countAllItems(requestId);
    }

    @Transactional(readOnly = true)
    public long countSentItems(UUID requestId) {
        return requestRepo.countSent(requestId);
    }

    @Transactional(readOnly = true)
    public long countFailedItems(UUID requestId) {
        return requestRepo.countFailed(requestId);
    }

    @Transactional(readOnly = true)
    public List<LetterItem> findAllByLetterRequestIds(List<UUID> requestId) {
        return itemRepo.findAllByLetterRequestIds(requestId);
    }

    @Transactional
    public void insertLetterItemsBatch(final UUID requestId, final Map<String,String> receivers){
        int i=0;
        for(Map.Entry<String,String> entry : receivers.entrySet()){
            final UUID itemId = UUID.randomUUID();
            insertItemIfNotExists(itemId,requestId,entry.getKey(),entry.getValue());
            
            if((++i % BATCH_FLUSH_SIZE) == 0){
                em.flush();
                em.clear();
            }
        }
        em.flush();
        em.clear();
    }

}




///fenaaa
package tr.gov.tcmb.ogmdfif.service.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tr.gov.tcmb.ogmdfif.constant.LetterStatusEnum;
import tr.gov.tcmb.ogmdfif.model.entity.LetterRequest;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class LetterProcessingJob {

    private static final int PICK_LIMIT = 20;
    private static final int MAX_RETRY   = 3;

    private final LetterJobTxService txService;
    private final LetterItemTxService itemTxService;

    @Scheduled(fixedDelayString = "PT1M") // 1 dakika
    // @SchedulerLock(name = "letterProcessingJob", lockAtLeastFor = "PT20S", lockAtMostFor = "PT5M")
    public void runBatch() {
        List<LetterRequest> candidates = txService.findReadyDue(PICK_LIMIT);
        if (candidates.isEmpty()) {
            log.debug("No READY requests to process.");
            return;
        }
        log.info("Picked {} request(s) to process", candidates.size());

        for (LetterRequest r : candidates) {
            try {
                processOneRequestSafe(r);
            } catch (Exception e) {
                log.error("Unexpected error while processing request {}", r.getId(), e);
            }
        }
    }

    /**
     * Üst seviye transaction'ı kapat: item'lar bağımsız REQUIRES_NEW ile çalışsın,
     * Persistence Context tutulmasın → stale snapshot problemi biter.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void processOneRequestSafe(LetterRequest r) {
        if (!txService.claimRequest(r.getId())) {
            log.info("Request {} already claimed by another worker.", r.getId());
            return;
        }

        long start = System.currentTimeMillis();

        // === IMPORTANT: Item'ları entity olarak değil, sadece ID'leriyle dolaş ===
        List<Long> itemIds = txService.getItemIds(r.getId());

        for (Long itemId : itemIds) {
            // Durumu DB'den taze oku (entity cache yok)
            Short statusId = txService.getStatusId(itemId);
            if (statusId != null && (statusId == 6 || statusId == 7)) continue; // final ise atla
            processOneItemWithRetry(r, itemId);
        }

        // Request final durumunu DB'den taze sayımla güncelle
        updateRequestFinalStatus(r.getId(), start);
    }

    /**
     * Her deneme REQUIRES_NEW içinde: bir deneme/kalem fail olursa diğerleri etkilenmez.
     * ID ile çalışarak stale entity problemini tamamen ortadan kaldırıyoruz.
     */
    public void processOneItemWithRetry(LetterRequest req, Long itemId) {
        short currentAttempts = txService.getAttemptCount(itemId) == null ? 0 : txService.getAttemptCount(itemId);

        for (short attemptNo = (short) (currentAttempts + 1); attemptNo <= MAX_RETRY; attemptNo++) {
            OffsetDateTime started = OffsetDateTime.now();
            long t0 = System.currentTimeMillis();
            String errCode = null, errMsg = null;
            String result  = "SUCCESS";

            try {
                // REQUIRES_NEW içinde tek attempt çalışır (LetterItemTxService tarafında)
                itemTxService.processSingleAttempt(req, itemId);
            } catch (Exception e) {
                result  = "FAIL";
                errCode = e.getClass().getSimpleName();
                errMsg  = safeMsg(e.getMessage());
            }

            int duration = (int) (System.currentTimeMillis() - t0);
            itemTxService.saveAttemptLog(req.getId(), itemId, attemptNo, started, duration, result, errCode, errMsg);

            if ("SUCCESS".equals(result)) {
                // 6 = SUCCESS/SENT
                itemTxService.updateItemStatus(itemId, (short) 6, attemptNo, null, null);
                return;
            } else {
                boolean lastTry = (attemptNo == MAX_RETRY);

                // Ara denemelerde "pending"i koru; son denemede 7 = FINAL_FAIL
                short nextStatus;
                if (lastTry) {
                    nextStatus = 7;
                } else {
                    Short cur = txService.getStatusId(itemId); // DB'den taze oku
                    nextStatus = (cur == null || cur == 0) ? 1 : cur; // 1 = PROCESSING/RETRY gibi
                }

                // HATA BİLGİSİNİ YAZ (önceki sürümde null gönderiliyordu)
                itemTxService.updateItemStatus(itemId, nextStatus, attemptNo, errCode, errMsg);

                if (lastTry) return; // final fail oldu, daha deneme yok
            }
        }
    }

    /**
     * Final: atomik kural → pending varsa PROCESSING, hepsi final ise
     * hepsi success → SENT, hepsi fail → ALL_FAILED, karışık → PARTIAL_SENT
     */
    private void updateRequestFinalStatus(UUID requestId, long startMillis) {
        long total = txService.countAllItems(requestId);
        long sent  = txService.countSentItems(requestId);
        long fail  = txService.countFailedItems(requestId);

        short status;
        String code;
        String msg = null;

        if (total == 0) {
            status = Short.parseShort(LetterStatusEnum.NO_ITEMS.getKod());
            code   = LetterStatusEnum.NO_ITEMS.getAdi();
            msg    = "Taleple ilgili detay kayıt bulunmamaktadır.";
        } else if (sent == total) {
            status = Short.parseShort(LetterStatusEnum.SENT.getKod());
            code   = LetterStatusEnum.SENT.name();
        } else if (fail == total) {
            status = Short.parseShort(LetterStatusEnum.ALL_FAILED.getKod());
            code   = LetterStatusEnum.ALL_FAILED.name();
            msg    = String.format("%d detay kayıt başarısızlıkla sonuçlandı. (Tümü)", total);
        } else if (sent + fail == total) { // hepsi final, karışık
            status = Short.parseShort(LetterStatusEnum.PARTIAL_SENT.getKod());
            code   = LetterStatusEnum.PARTIAL_SENT.getAdi();
            msg    = String.format("%d/%d detay kayıt başarısızlıkla sonuçlandı.", fail, total);
        } else {
            status = Short.parseShort(LetterStatusEnum.PROCESSING.getKod()); // pending var
            code   = LetterStatusEnum.PROCESSING.getAdi();
        }

        txService.finishRequest(requestId, status, code, msg);
        log.info("Request {} finished in {} ms → status={}, sent/fail/total={}/{}/{}",
                requestId, (System.currentTimeMillis() - startMillis), status, sent, fail, total);
    }

    private String safeMsg(String s) {
        if (s == null) return null;
        return s.length() > 4000 ? s.substring(0, 4000) : s;
    }
}



//job22
package tr.gov.tcmb.ogmdfif.service.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tr.gov.tcmb.ogmdfif.constant.LetterStatusEnum;
import tr.gov.tcmb.ogmdfif.model.entity.LetterItem;
import tr.gov.tcmb.ogmdfif.model.entity.LetterRequest;
import tr.gov.tcmb.ogmdfif.service.ItemSender;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class LetterProcessingJob {

    private static final int PICK_LIMIT = 20;
    private static final int MAX_RETRY = 3;

    private final LetterJobTxService txService;
    private final ItemSenderFactory itemSenderFactory;
    private final LetterItemTxService itemTxService;

    @Scheduled(fixedDelayString = "PT1M") // 1 dakika
    //@SchedulerLock(name = "letterProcessingJob", lockAtLeastFor = "PT20S", lockAtMostFor = "PT5M")
    public void runBatch() {
        List<LetterRequest> candidates = txService.findReadyDue(PICK_LIMIT);
        if (candidates.isEmpty()) {
            log.debug("No READY requests to process.");
            return;
        }
        log.info("Picked {} request(s) to process", candidates.size());

        for (LetterRequest r : candidates) {
            try {
                processOneRequestSafe(r);
            } catch (Exception e) {
                log.error("Unexpected error while processing request {}", r.getId(), e);
            }
        }
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void processOneRequestSafe(LetterRequest r) {
        if (!txService.claimRequest(r.getId())) {
            log.info("Request {} already claimed by another worker.", r.getId());
            return;
        }

        long start = System.currentTimeMillis();

        // Item'ları gönder
        List<LetterItem> items = txService.getItems(r.getId());
        for(LetterItem item : items) {
            if (item.getStatusId() != null && (item.getStatusId() == 6 || item.getStatusId() == 7)) continue;
            processOneItemWithRetry(r, item);
        }

        // Request final durum
        updateRequestFinalStatus(r.getId(), start);
    }


    public void processOneItemWithRetry(LetterRequest req, LetterItem item) {
        short currentAttempts = item.getAttemptCount() == null ? 0 : item.getAttemptCount();

        for (short attemptNo = (short) (currentAttempts + 1); attemptNo <= MAX_RETRY; attemptNo++) {
            OffsetDateTime started = OffsetDateTime.now();
            long t0 = System.currentTimeMillis();
            String errCode = null, errMsg = null;
            String result = "SUCCESS";

            try {
                itemTxService.processSingleAttempt(req, item);
            } catch (Exception e) {
                result = "FAIL";
                errCode = e.getClass().getSimpleName();
                errMsg = safeMsg(e.getMessage());
            }

            int duration = (int) (System.currentTimeMillis() - t0);
            itemTxService.saveAttemptLog(req.getId(), item.getId(), attemptNo, started, duration, result, errCode, errMsg);

            if ("SUCCESS".equals(result)) {
                itemTxService.updateItemStatus(item.getId(), (short) 6, attemptNo, null, null);
                return;
            } else {
                boolean lastTry = (attemptNo == MAX_RETRY);
                short failStatus = lastTry ? (short) 7 : (short) (item.getStatusId() == null ? 1 : item.getStatusId());
                itemTxService.updateItemStatus(item.getId(), failStatus, attemptNo, null, null);

                /*if (lastTry) {
                    txService.updateItemStatus(item.getId(), (short) 7, attemptNo, errCode, errMsg);
                    return;
                } else {
                    txService.updateItemStatus(item.getId(), item.getStatusId() == null ? (short) 1 : item.getStatusId(), attemptNo, errCode, errMsg);
                }*/
            }
        }
    }

    private void updateRequestFinalStatus(UUID requestId, long startMillis) {
        long total = txService.countAllItems(requestId);
        long sent = txService.countSentItems(requestId);
        long fail = txService.countFailedItems(requestId);

        short status;
        String code, msg = null;

        if (total == 0) {
            status = Short.parseShort(LetterStatusEnum.NO_ITEMS.getKod());
            code = LetterStatusEnum.NO_ITEMS.getAdi();
            msg = "Taleple ilgili detay kayıt bulunmamaktadır.";
        } else if (sent == total) {
            status = Short.parseShort(LetterStatusEnum.SENT.getKod()); // SENT
            code = LetterStatusEnum.SENT.name();
        } else if (sent > 0 && fail > 0 && (sent+fail == total)) {
            status = Short.parseShort(LetterStatusEnum.PARTIAL_SENT.getKod());;
            code = LetterStatusEnum.PARTIAL_SENT.getAdi();
            msg = String.format("%d/%d detay kayıt başarısızlıkla sonuçlandı.", fail, total);
        } else if(fail == total) {
            status = Short.parseShort(LetterStatusEnum.ALL_FAILED.getKod());
            code = LetterStatusEnum.ALL_FAILED.name();
            msg = String.format("%d detay kayıt başarısızlıkla sonuçlandı.(Tümü)", total);
        }else{
            status = Short.parseShort(LetterStatusEnum.PROCESSING.getKod());;
            code = LetterStatusEnum.PROCESSING.getAdi();
        }

        txService.finishRequest(requestId, status, code, msg);
        log.info("Request {} finished in {} ms → status={}, sent={}/{}", requestId,
                (System.currentTimeMillis() - startMillis), status, sent, total);
    }

    private String safeMsg(String s) {
        if (s == null) return null;
        return s.length() > 4000 ? s.substring(0, 4000) : s;
    }
}

////jobbb
package tr.gov.tcmb.ogmdfif.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tr.gov.tcmb.ogmdfif.model.entity.LetterAttempt;
import tr.gov.tcmb.ogmdfif.model.entity.LetterItem;
import tr.gov.tcmb.ogmdfif.model.entity.LetterRequest;
import tr.gov.tcmb.ogmdfif.repository.LetterAttemptRepository;
import tr.gov.tcmb.ogmdfif.repository.LetterItemRepository;
import tr.gov.tcmb.ogmdfif.repository.LetterRequestRepository;


import javax.persistence.EntityManager;
import java.time.OffsetDateTime;
import java.util.List;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class LetterJobTxService {

    private final LetterRequestRepository requestRepo;
    private final LetterItemRepository itemRepo;
    private final LetterAttemptRepository attemptRepo;
    
    private final EntityManager em;

    @Transactional(readOnly = true)
    public List<LetterRequest> findReadyDue(int limit) {
        return requestRepo.findReadyDue(limit);
    }

    @Transactional
    public boolean claimRequest(UUID requestId) {
        return requestRepo.markProcessing(requestId) > 0;
    }

    @Transactional
    public void insertItemIfNotExists(UUID id,UUID requestId, String receiverKey, String receiverValue) {
        itemRepo.insertIfNotExists(id,requestId, receiverKey, receiverValue);
    }

    @Transactional
    public List<LetterItem> getItems(UUID requestId) {
        return itemRepo.findAllByRequestId(requestId);
    }

    @Transactional
    public void updateItemStatus(UUID itemId, short statusId, short attemptCount, String errorCode, String errorMessage) {
        itemRepo.updateStatus(itemId, statusId, attemptCount, errorCode, errorMessage);
    }

    @Transactional
    public void logAttempt(UUID id,UUID requestId, UUID itemId, short attemptNo,
                           OffsetDateTime startedAt, OffsetDateTime finishedAt, int durationMs,
                           String result, String errorCode, String errorMessage) {
        attemptRepo.insertAttempt(id,requestId, itemId, attemptNo, startedAt, finishedAt, durationMs, result, errorCode, errorMessage);
    }

    @Transactional
    public void finishRequest(UUID requestId, short statusId, String errorCode, String errorMessage) {
        requestRepo.finishRequest(requestId, statusId, errorCode, errorMessage);
    }

    @Transactional(readOnly = true)
    public long countAllItems(UUID requestId) {
        return requestRepo.countAllItems(requestId);
    }

    @Transactional(readOnly = true)
    public long countSentItems(UUID requestId) {
        return requestRepo.countSent(requestId);
    }

    @Transactional(readOnly = true)
    public long countFailedItems(UUID requestId) {
        return requestRepo.countFailed(requestId);
    }

    @Transactional(readOnly = true)
    public List<LetterItem> findAllByLetterRequestIds(List<UUID> requestId) {
        return itemRepo.findAllByLetterRequestIds(requestId);
    }

}



//package




package tr.gov.tcmb.ogmdfif.config;









 
 
 yeni exe
 @Override
    public LetterRequestListePageDTO handleGetLetterRequestDtoTransaction(
            int activePage, int pageSize, KararTipiEnum belgeTip,
            Integer belgeNo,
            Integer belgeYil,
            String kararNo,
            LocalDate ilkOdemeTarih,
            LocalDate sonOdemeTarih,
            String vkn,
            String tckn,
            MektupTipEnum mektupTip) throws Exception {

        log.debug("handleGetLetterRequestDtoTransaction method called with parameters: belgeTip={}, belgeNo={}, belgeYil={}, kararNo={}, ilkOdemeTarih={}, sonOdemeTarih={}, vkn={}, tckn={}, mektupTip={}",
                belgeTip, belgeNo, belgeYil, kararNo, ilkOdemeTarih, sonOdemeTarih, vkn, tckn, mektupTip);


        int size = 0;
        Sort sort = null;

        List<LetterRequest> letterRequestList = letterRequestTransactionService.listLetterRequest(ilkOdemeTarih, sonOdemeTarih, belgeTip, belgeNo, belgeYil, kararNo, vkn, tckn, mektupTip);

        if (letterRequestList == null || letterRequestList.isEmpty()) {
            log.warn("letterRequestList is empty or null. Returning empty list.");
            return new LetterRequestListePageDTO(new ArrayList<>(), size, 1, sort);
        }

        int totalPage = 1 + letterRequestList.size() / 10;
        if (activePage > totalPage) {
            activePage = 1;
        }

        List<CompletableFuture<LetterRequestDto>> futures = letterRequestList.stream()
                .map(letterRequest -> CompletableFuture.supplyAsync(()-> {
                    log.debug("Mapping LetterRequest to LetterRequestDto. LetterRequest ID: {}", letterRequest.getId());

                    LetterRequestDto letterRequestDto = new LetterRequestDto();
                    letterRequestDto.setRequestTypeId(MektupTipEnum.convertRequestTypeIdToMektupTip(letterRequest.getRequestTypeId()).getAdi());

                    letterRequestDto.setTalepDurum(Optional.ofNullable(LetterStatusEnum.getByKod(String.valueOf(letterRequest.getStatusId())))
                            .map(LetterStatusEnum::getAdi)
                            .orElse(null));

                    try {
                        letterRequestConverter.doConvertToEntity(letterRequest, letterRequestDto);
                    } catch (ParseException e) {
                        String message = "Failed to convert letterRequestDTO to entity";
                        log.error("Mektup isteği dönüştürme hatası: {}", e.getMessage(), e);
                        throw new RuntimeException(message, e);
                    }

                    log.debug("Getting LetterItems for LetterRequest ID: {}", letterRequest.getId());
                    List<LetterItemDTO> letterItemDTOs = jobTxService.getItems(letterRequest.getId())
                            .stream()
                            .map(letterItem -> {
                                log.debug("Mapping LetterItem to LetterItemDTO. LetterItem ID: {}", letterItem.getId());

                                LetterItemDTO letterItemDto = new LetterItemDTO();
                                letterItemDto.setStatus(Optional.ofNullable(LetterStatusEnum.getByKod(String.valueOf(letterItem.getStatusId())))
                                        .map(LetterStatusEnum::getAdi)
                                        .orElse(null));

                                letterItemConverter.doConvertToDto(letterItemDto, letterItem);
                                letterItemDto.setNotifyLogs(this.preparedNotifyLogDto(letterItem));

                                return letterItemDto;
                            })
                            .collect(Collectors.toList());

                    letterRequestDto.setItemDTOList(letterItemDTOs);
                    return letterRequestDto;
                },letterReqExecutor))
                .collect(Collectors.toList());

        List<LetterRequestDto> result = futures.stream().map(CompletableFuture::join)
                .sorted(Comparator.comparing(LetterRequestDto::getSorguTarihi, Comparator.reverseOrder()))
                .collect(Collectors.toList());

        log.debug("handleGetLetterRequestDtoTransaction method completed successfully.");

        Pageable pageable = PageRequest.of(activePage - 1, pageSize);
        int start = (int) pageable.getOffset();
        int end = Math.min((start + pageable.getPageSize()), result.size());

        List<LetterRequestDto> pagedLetterRequestDtoList = result.subList(start, end);

        Page<LetterRequestDto> page = new PageImpl<>(pagedLetterRequestDtoList, pageable, result.size());
        size = (int) page.getTotalElements();
        totalPage = page.getTotalPages();
        sort = page.getSort();

        return new LetterRequestListePageDTO(pagedLetterRequestDtoList, size, totalPage, sort);

    }

//exe 
/* eslint-disable react/no-is-mounted */
/**
 *
 * OdemeMektuplari
 *
 */

import React from 'react';
import PropTypes from 'prop-types';

import injectSaga from 'utils/injectSaga';
import injectReducer from 'utils/injectReducer';
import { injectIntl } from 'react-intl';
import { connect } from 'react-redux';
import { compose } from 'redux';
import { toast } from 'react-toastify';

import { createStructuredSelector } from 'reselect';
import { Form, DataTable, Button, Segment, Grid, Modal, List } from 'tcmb-ui-components';

import reducer from './redux/reducer';
import saga from './redux/saga';
import { mektupTipiOptions, paketTipiOptions } from './redux/utility';
import { mektupYazdir, searchIhracatci, clearIhracatci, mektupEpostaGonder,mektupTalepSearch } from './redux/actions';
import makeSelectOdemeMektuplari from './redux/selectors';
import DropdownKararNo from '../../components/DropdownKararNo';
import DropdownIhracatci from '../../components/DropdownIhracatci';

import { MektupDetayColumns, MektupDetayLogColumns, MektupMainColumns } from './columns';
import ReactJson from 'react-json-view';

/* eslint-disable react/prefer-stateless-function */
const TRAN_STATES = {
  IDLE: 'IDLE',
  WARNING_CHECK: 'WARNING_CHECK',
};

export class OdemeMektuplari extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: false,
      tranState: TRAN_STATES.IDLE,
      clearIhracatciAdi: false,
      onConfirm: null, // modal onaylandığında çalıştırılacak aksiyon
      selectedRows: [],
      selectedTaleps: new Set(),
    };
    this.handlePaginationChange = this.handlePaginationChange.bind(this);
    this.handlePageSizeChange = this.handlePageSizeChange.bind(this);
    //this.handleSelectMuhasebeIslemleri = this.handleSelectMuhasebeIslemleri.bind(this);
  }

  // --- helpers ---

  handleIhracatciSelect = (ihracatciAdi) => {
    // "1234567890 - Foo A.Ş." -> "1234567890"
    const ihracatciKodu = (ihracatciAdi.split(' - ')[0] || '').trim();
    if (ihracatciKodu.length === 10) {
      this.setState({ searchVkn: ihracatciKodu, searchTckn: '' });
    } else if (ihracatciKodu.length === 11) {
      this.setState({ searchTckn: ihracatciKodu, searchVkn: '' });
    } else {
      this.setState({ searchTckn: '', searchVkn: '' });
    }
  };

  formatDate = (d) => (d && d.format ? d.format('YYYY-MM-DD') : '');

  // --- actions ---

  mektupTalepSearchFunc = () => {
    this.props.dispatch(
      mektupTalepSearch(
        this.props.odemeMektuplari.activePage,
        this.props.odemeMektuplari.rowCount,
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupEpostaGonderFunc = () => {
    this.props.dispatch(
      mektupEpostaGonder(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupYazdirFields = () => {
    this.props.dispatch(
      mektupYazdir(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  handleSearchIhracatciFields(ihracatciVkn, ihracatciTckn) {
    this.props.dispatch(searchIhracatci(ihracatciVkn, ihracatciTckn));
  }

  handleClearMektupFields = () => {
    this.setState((s) => ({
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: !s.clearKararNo,
      clearIhracatciAdi: !s.clearIhracatciAdi,
    }));
    this.props.dispatch(clearIhracatci());
  };

  // tabloda seçimler
  handleClearList() {
    this.setState({ selectedTaleps: new Set(), selectedRows: [] });
  }

  handleSelectMektupIslemleriFromList(rowsData) {
    const selectedTaleps = new Set();
    const selectedItemsSet = new Set();

    rowsData.forEach((rowData) => {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    });

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  handleSelectMektupIslemleri(rowData, checked) {
    const { selectedTaleps, selectedRows } = this.state;
    const selectedItemsSet = new Set(selectedRows);

    if (checked) {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    } else {
      selectedTaleps.delete(rowData.requestId);
      selectedItemsSet.delete(rowData.id);
    }

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  // opsiyonel: datatable prop'larında referans var ise boş tanımlı kalsın



  handlePaginationChange(event, { activePage }) {
    if (activePage !== this.props.odemeMektuplari.activePage) {
      this.props.odemeMektuplari.activePage = activePage;
      this.mektupTalepSearchFunc();
      this.setState({ selectedTaleps: new Set() });
      this.setState({ selectedRows: [] });
    }
  }

  handlePageSizeChange(event, data) {
    const newPageSize = data.value;
    const newTotalPages = Math.ceil(this.props.odemeMektuplari.size / newPageSize);
    const newActivePage = Math.min(newTotalPages, this.props.odemeMektuplari.activePage);

    this.props.odemeMektuplari.rowCount = newPageSize;
    this.props.odemeMektuplari.totalPages = newTotalPages;
    this.props.odemeMektuplari.activePage = newActivePage;

    this.mektupTalepSearchFunc();
    this.setState({ selectedTaleps: new Set() });
  }



  // --- render ---

  render() {
    return (
      <div>
        {this.renderOdemeMektup()}
        {this.renderCheckProcess()}
      </div>
    );
  }

  renderOdemeMektup() {
    return (
      <div>
        {this.renderSearchOdemeMektup()}
        {this.renderMektupIslemleriTable()}
      </div>
    );
  }

  renderCheckProcess() {
    const { tranState, onConfirm } = this.state;
    if (tranState === TRAN_STATES.IDLE) return null;

    return (
      <Modal open size="tiny">
        <Modal.Content style={{ minHeight: '120px' }}>
          <List relaxed size="large">
            {tranState === TRAN_STATES.WARNING_CHECK && (
              <List.Item>
                <List.Icon name="exclamation triangle" color="yellow" />
                <List.Content>
                  VKN veya TCKN alanları boş! İşleme devam etmeniz durumunda seçilen tarihe ilişkin tüm ödeme mektupları gönderilecektir. Bu
                  işleme devam etmek istediğinize emin misiniz?
                </List.Content>
                <div style={{ marginTop: '15px', textAlign: 'right' }}>
                  <Button color="red" onClick={() => this.setState({ tranState: TRAN_STATES.IDLE, onConfirm: null })}>
                    İptal
                  </Button>
                  <Button
                    color="green"
                    onClick={() => {
                      if (typeof onConfirm === 'function') onConfirm();
                      this.setState({ tranState: TRAN_STATES.IDLE, onConfirm: null });
                    }}
                  >
                    Devam Et
                  </Button>
                </div>
              </List.Item>
            )}
          </List>
        </Modal.Content>
      </Modal>
    );
  }

  renderSearchOdemeMektup = () => (
    <Segment.Group className="tcmb-datatable">
      <Segment className="header-segment">
        <b>Mektup Arama</b>
      </Segment>
      <Segment className="table-segment" />
      <br />
      <div className="align-form-fields">
        <Form
          onSubmit={(event, data) => {
            event.preventDefault();

            const errors = data.validateForm();
            const submitterId = event?.nativeEvent?.submitter?.id;

            // Temizle butonu submit değil, ama yine de güvenlik için koruyalım
            if (submitterId === 'btnClearSearchMektup') return;

            if (errors !== null && submitterId !== 'btnMektupSearchNew') {
              toast.error('Lütfen, hatalı alanları düzeltiniz!');
              return;
            }

            switch (submitterId) {
              case 'btnMektupSearchNew':
                // Arama için validasyon serbest; istersen tarih/mektupTip kontrolü ekleyebilirsin
                this.mektupTalepSearchFunc();
                break;
              case 'btnYazdir':
                this.mektupYazdirFields();
                break;
              case 'btnEmailGonder':
                if (!this.state.searchVkn && !this.state.searchTckn) {
                  this.setState({
                    tranState: TRAN_STATES.WARNING_CHECK,
                    onConfirm: () => this.mektupEpostaGonderFunc(),
                  });
                } else {
                  this.mektupEpostaGonderFunc();
                }
                break;
              default:
                break;
            }
          }}
        >
          <Grid columns="5">
            <Grid.Row>
              <Grid.Column width={5}>
                <Form.Select
                  id="TahakkukSearchTurId"
                  label="Tahakkuk Türü"
                  placeholder=""
                  value={this.state.searchBelgeTip}
                  search
                  clearable
                  onChange={(e, data) => this.setState({ searchBelgeTip: data.value })}
                  options={paketTipiOptions}
                />
              </Grid.Column>

              <Grid.Column width={5}>
                <Form.Input
                  label="Belge No"
                  value={this.state.searchBelgeNo || ''}
                  onChange={(e, data) => this.setState({ searchBelgeNo: data.value })}
                  validation={{
                    rules: [{ type: 'length', max: 10 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>

              <Grid.Column width={4}>
                <Form.Input
                  label="Yıl"
                  type="text"
                  maxLength="4"
                  value={this.state.searchBelgeYil || ''}
                  onChange={(e, data) => this.setState({ searchBelgeYil: data.value })}
                  validation={{
                    rules: [{ type: 'length', max: 4 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={16}>
                <DropdownKararNo
                  onSelect={(value) => this.setState({ searchKararNo: value })}
                  clearTrigger={this.state.clearKararNo}
                />
              </Grid.Column>
              <Grid.Column width={8}>
                <Form.Field>
                  <Form.Datepicker
                    label="İlk Ödeme Tarihi"
                    onChange={(date) => this.setState({ searchOdemeTarih: date })}
                    dateFormat="DD.MM.YYYY"
                    selected={this.state.searchOdemeTarih}
                    showYearDropdown
                    showMonthDropdown
                    todayButton="Bugün"
                    validation={{
                      rules: [{ type: 'required' }],
                      validateOnChange: true,
                      validateOnMount: true,
                      showErrors: 'all',
                    }}
                  />
                </Form.Field>
              </Grid.Column>
              <Grid.Column width={8}>
                <Form.Field>
                  <Form.Datepicker
                    label="Son Ödeme Tarihi"
                    onChange={(date) => this.setState({ searchOdemeTarihSon: date })}
                    dateFormat="DD.MM.YYYY"
                    selected={this.state.searchOdemeTarihSon}
                    showYearDropdown
                    showMonthDropdown
                    todayButton="Bugün"
                    validation={{
                      rules: [{ type: 'required' }],
                      validateOnChange: true,
                      validateOnMount: true,
                      showErrors: 'all',
                    }}
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={8}>
                <Form.Input
                  id="searchIhracatciVkn"
                  label="Firma Vergi Kimlik No"
                  type="text"
                  maxLength="10"
                  value={this.state.searchVkn}
                  disabled={this.state.searchTckn !== ''}
                  onChange={(e, data) => {
                    const v = data.value;
                    this.setState({ searchVkn: v });
                    if (v.length === 10) {
                      this.handleSearchIhracatciFields(v, '');
                    } else {
                      this.props.dispatch(clearIhracatci());
                    }
                  }}
                  validation={{
                    rules: [{ type: 'length', max: 10 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>

              <Grid.Column width={8}>
                <Form.Input
                  id="searchIhracatciTckn"
                  label="Üretici TC Kimlik No"
                  type="text"
                  maxLength="11"
                  value={this.state.searchTckn}
                  disabled={this.state.searchVkn !== ''}
                  onChange={(e, data) => {
                    const t = data.value;
                    this.setState({ searchTckn: t });
                    if (t.length === 11) {
                      this.handleSearchIhracatciFields('', t);
                    } else {
                      this.props.dispatch(clearIhracatci());
                    }
                  }}
                  validation={{
                    rules: [{ type: 'length', max: 11 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>

            <Grid.Row>
              <Grid.Column width={16}>
                <DropdownIhracatci
                  onSelect={this.handleIhracatciSelect}
                  clearTrigger={this.state.clearIhracatciAdi}
                />
              </Grid.Column>
            </Grid.Row>

            <Grid.Row>
              <Grid.Column width={16}>
                <Form.Select
                  id="mektupTipId"
                  label="Mektup Tipi"
                  placeholder=""
                  value={this.state.searchMektupTip}
                  search
                  clearable
                  onChange={(e, data) => this.setState({ searchMektupTip: data.value })}
                  options={mektupTipiOptions}
                  validation={{
                    rules: [{ type: 'required' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>

            <div className="align-buttons">
              <Grid.Row>
                <Form.Group>
                  <Form.Field>
                    <Button
                      id="btnMektupSearchNew"
                      content="Ara"
                      type="submit"
                      loading={this.props.odemeMektuplari.mektupSearchLoading}
                      className="dfif-button-blue"
                    />
                  </Form.Field>

                  <Form.Field>
                    <Button
                      id="btnClearSearchMektup"
                      content="Temizle"
                      type="button"
                      onClick={this.handleClearMektupFields}
                      className="dfif-button-white"
                    />
                  </Form.Field>

                  <Form.Field>
                    <Button
                      id="btnYazdir"
                      content="Yazdır"
                      type="submit"
                      loading={this.props.odemeMektuplari.mektupYazdirLoading}
                      className="dfif-button-blue"
                    />
                  </Form.Field>

                  {isSearchMektupTipValid(this.state.searchMektupTip) && (
                    <Form.Field>
                      <Button
                        id="btnEmailGonder"
                        content="İhracatçılara Eposta Gönder"
                        type="submit"
                        loading={this.props.odemeMektuplari.mektupEpostaGonderLoading}
                        className="dfif-button-blue"
                      />
                    </Form.Field>
                  )}
                </Form.Group>
              </Grid.Row>
            </div>
          </Grid>
        </Form>
      </div>
    </Segment.Group>
  );

  renderMektupIslemleriTable = () => (
    <Segment.Group className="tcmb-datatable">
      <Segment className="header-segment">
        <b>Talep Listesi</b>
      </Segment>

      <DataTable
        loading={this.props.odemeMektuplari.mektupSearchLoading}
        columns={MektupMainColumns}
        resizable
        getRowKey="requestId"
        data={this.props.odemeMektuplari.mektupTalepList || []}
        celled
        selectable
        noResultsMessage="Aradığınız kriterlere uygun kayıt bulunamadı"
        columnMenu
        export={{ fileName: 'Mektup Talep Islemleri', sheetName: 'Sheet 1', types: ['xlsx'] }}
        rowSelection="multiple"
        onRowSelect={this.handleSelectMektupIslemleri}
        onRowsSelect={(rowsData) => {
          if (rowsData && rowsData.length > 0) {
            this.handleSelectMektupIslemleriFromList(rowsData);
          } else {
            this.handleClearList();
          }
        }}
        selectedRows={this.state.selectedRows}
        allRowsSelection
        page
        pagination
        onPageSizeChange={this.handlePageSizeChange}
        paginationProps={{
          totalPages: this.props.odemeMektuplari.totalPages,
          activePage: this.props.odemeMektuplari.activePage,
          onPageChange: this.handlePaginationChange,
        }}
        getRowDetail={(rowData) => (
          <DataTable
            getRowKey="itemId"
            columns={MektupDetayColumns}
            resizable
            data={rowData.itemDTOList}
            celled
            getRowDetail={(rowData) => (
              <DataTable
                getRowKey="logId"
                columns={MektupDetayLogColumns}
                resizable
                data={rowData.notifyLogs}
                celled
                getRowDetail={rowLogData => (
                  <div>
                    <p>
                      <b>{rowLogData.mailBody}</b>
                    </p>
                  </div>
                )}
              />
            )}
          />
        )}
      />
    </Segment.Group>
  );
}

OdemeMektuplari.propTypes = {
  dispatch: PropTypes.func.isRequired,
  odemeMektuplari: PropTypes.any,
};

const mapStateToProps = createStructuredSelector({
  odemeMektuplari: makeSelectOdemeMektuplari(),
});

function isSearchMektupTipValid(searchMektupTip) {
  return searchMektupTip === '1' || searchMektupTip === '2' || searchMektupTip === '4';
}

function mapDispatchToProps(dispatch) {
  return { dispatch };
}

const withConnect = connect(mapStateToProps, mapDispatchToProps);
const withReducer = injectReducer({ key: 'odemeMektuplari', reducer });
const withSaga = injectSaga({ key: 'odemeMektuplari', saga });

export default compose(withReducer, withSaga, withConnect)(injectIntl(OdemeMektuplari));


//asl
/* eslint-disable react/no-is-mounted */
/**
 *
 * OdemeMektuplari
 *
 */

import React from 'react';
import PropTypes from 'prop-types';

import injectSaga from 'utils/injectSaga';
import injectReducer from 'utils/injectReducer';
import { injectIntl } from 'react-intl';
import { connect } from 'react-redux';
import { compose } from 'redux';
import { toast } from 'react-toastify';

import { createStructuredSelector } from 'reselect';
import { Form, DataTable, Button, Segment, Grid, Modal, List } from 'tcmb-ui-components';

import reducer from './redux/reducer';
import saga from './redux/saga';
import { mektupTipiOptions, paketTipiOptions } from './redux/utility';
import { mektupYazdir, searchIhracatci, clearIhracatci, mektupEpostaGonder, mektupTalepSearch } from './redux/actions';
import makeSelectOdemeMektuplari from './redux/selectors';
import DropdownKararNo from '../../components/DropdownKararNo';
import DropdownIhracatci from '../../components/DropdownIhracatci';

import { MektupDetayColumns, MektupDetayLogColumns, MektupMainColumns } from './columns';
import ReactJson from 'react-json-view';

/* eslint-disable react/prefer-stateless-function */
const TRAN_STATES = {
  IDLE: 'IDLE',
  WARNING_CHECK: 'WARNING_CHECK',
};

export class OdemeMektuplari extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: false,
      tranState: TRAN_STATES.IDLE,
      clearIhracatciAdi: false,
      onConfirm: null, // modal onaylandığında çalıştırılacak aksiyon
      selectedRows: [],
      selectedTaleps: new Set(),

      // EKLENDİ: Detay modalı için state
      isDetailOpen: false,
      detailRow: null,
    };
    this.handlePaginationChange = this.handlePaginationChange.bind(this);
    this.handlePageSizeChange = this.handlePageSizeChange.bind(this);
  }

  // --- helpers ---

  handleIhracatciSelect = (ihracatciAdi) => {
    const ihracatciKodu = (ihracatciAdi.split(' - ')[0] || '').trim();
    if (ihracatciKodu.length === 10) {
      this.setState({ searchVkn: ihracatciKodu, searchTckn: '' });
    } else if (ihracatciKodu.length === 11) {
      this.setState({ searchTckn: ihracatciKodu, searchVkn: '' });
    } else {
      this.setState({ searchTckn: '', searchVkn: '' });
    }
  };

  formatDate = (d) => (d && d.format ? d.format('YYYY-MM-DD') : '');

  // --- actions ---

  mektupTalepSearchFunc = () => {
    this.props.dispatch(
      mektupTalepSearch(
        this.props.odemeMektuplari.activePage,
        this.props.odemeMektuplari.rowCount,
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupEpostaGonderFunc = () => {
    this.props.dispatch(
      mektupEpostaGonder(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupYazdirFields = () => {
    this.props.dispatch(
      mektupYazdir(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  handleSearchIhracatciFields(ihracatciVkn, ihracatciTckn) {
    this.props.dispatch(searchIhracatci(ihracatciVkn, ihracatciTckn));
  }

  handleClearMektupFields = () => {
    this.setState((s) => ({
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: !s.clearKararNo,
      clearIhracatciAdi: !s.clearIhracatciAdi,
    }));
    this.props.dispatch(clearIhracatci());
  };

  // tabloda seçimler
  handleClearList() {
    this.setState({ selectedTaleps: new Set(), selectedRows: [] });
  }

  handleSelectMektupIslemleriFromList(rowsData) {
    const selectedTaleps = new Set();
    const selectedItemsSet = new Set();

    rowsData.forEach((rowData) => {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    });

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  handleSelectMektupIslemleri(rowData, checked) {
    const { selectedTaleps, selectedRows } = this.state;
    const selectedItemsSet = new Set(selectedRows);

    if (checked) {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    } else {
      selectedTaleps.delete(rowData.requestId);
      selectedItemsSet.delete(rowData.id);
    }

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  handlePaginationChange(event, { activePage }) {
    if (activePage !== this.props.odemeMektuplari.activePage) {
      this.props.odemeMektuplari.activePage = activePage;
      this.mektupTalepSearchFunc();
      this.setState({ selectedTaleps: new Set(), selectedRows: [] });
    }
  }

  handlePageSizeChange(event, data) {
    const newPageSize = data.value;
    const newTotalPages = Math.ceil(this.props.odemeMektuplari.size / newPageSize);
    const newActivePage = Math.min(newTotalPages, this.props.odemeMektuplari.activePage);

    this.props.odemeMektuplari.rowCount = newPageSize;
    this.props.odemeMektuplari.totalPages = newTotalPages;
    this.props.odemeMektuplari.activePage = newActivePage;

    this.mektupTalepSearchFunc();
    this.setState({ selectedTaleps: new Set() });
  }

  // EKLENDİ: Çift tıklama ile modal açma
  handleRowDoubleClick = (rowData) => {
    this.setState({
      detailRow: rowData,
      isDetailOpen: true,
    });
  };

  // --- render ---

  render() {
    return (
      <div>
        {this.renderOdemeMektup()}
        {this.renderCheckProcess()}
        {this.renderRowDetailModal()} {/* EKLENDİ */}
      </div>
    );
  }

  renderOdemeMektup() {
    return (
      <div>
        {this.renderSearchOdemeMektup()}
        {this.renderMektupIslemleriTable()}
      </div>
    );
  }

  renderMektupIslemleriTable = () => (
    <Segment.Group className="tcmb-datatable">
      <Segment className="header-segment">
        <b>Talep Listesi</b>
      </Segment>

      <DataTable
        loading={this.props.odemeMektuplari.mektupSearchLoading}
        columns={MektupMainColumns}
        resizable
        getRowKey="requestId"
        data={this.props.odemeMektuplari.mektupTalepList || []}
        celled
        selectable
        noResultsMessage="Aradığınız kriterlere uygun kayıt bulunamadı"
        columnMenu
        export={{ fileName: 'Mektup Talep Islemleri', sheetName: 'Sheet 1', types: ['xlsx'] }}
        rowSelection="multiple"
        onRowSelect={this.handleSelectMektupIslemleri}
        onRowsSelect={(rowsData) => {
          if (rowsData && rowsData.length > 0) {
            this.handleSelectMektupIslemleriFromList(rowsData);
          } else {
            this.handleClearList();
          }
        }}
        selectedRows={this.state.selectedRows}
        allRowsSelection
        page
        pagination
        onPageSizeChange={this.handlePageSizeChange}
        paginationProps={{
          totalPages: this.props.odemeMektuplari.totalPages,
          activePage: this.props.odemeMektuplari.activePage,
          onPageChange: this.handlePaginationChange,
        }}
        getRowDetail={(rowData) => (
          <DataTable
            getRowKey="itemId"
            columns={MektupDetayColumns}
            resizable
            data={rowData.itemDTOList}
            celled
            getRowDetail={(rowData) => (
              <DataTable
                getRowKey="logId"
                columns={MektupDetayLogColumns}
                resizable
                data={rowData.notifyLogs}
                celled
                getRowDetail={(rowLogData) => (
                  <div>
                    <p>
                      <b>{rowLogData.mailBody}</b>
                    </p>
                  </div>
                )}
              />
            )}
          />
        )}
        // EKLENDİ: satıra çift tıklama
        getRowProps={(rowData) => ({
          onDoubleClick: () => this.handleRowDoubleClick(rowData),
          style: { cursor: 'pointer' },
        })}
      />
    </Segment.Group>
  );

  // EKLENDİ: Modal detay görüntüleme
  renderRowDetailModal = () => {
    const { isDetailOpen, detailRow } = this.state;
    if (!isDetailOpen) return null;

    return (
      <Modal open size="large" onClose={() => this.setState({ isDetailOpen: false, detailRow: null })}>
        <Modal.Header>
          <b>Talep Detayı</b>
        </Modal.Header>
        <Modal.Content>
          {detailRow ? (
            <ReactJson src={detailRow} name={null} collapsed={2} displayDataTypes={false} />
          ) : (
            <p>Detay bulunamadı</p>
          )}
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => this.setState({ isDetailOpen: false, detailRow: null })}>Kapat</Button>
        </Modal.Actions>
      </Modal>
    );
  };
}

OdemeMektuplari.propTypes = {
  dispatch: PropTypes.func.isRequired,
  odemeMektuplari: PropTypes.any,
};

const mapStateToProps = createStructuredSelector({
  odemeMektuplari: makeSelectOdemeMektuplari(),
});

function isSearchMektupTipValid(searchMektupTip) {
  return searchMektupTip === '1' || searchMektupTip === '2' || searchMektupTip === '4';
}

function mapDispatchToProps(dispatch) {
  return { dispatch };
}

const withConnect = connect(mapStateToProps, mapDispatchToProps);
const withReducer = injectReducer({ key: 'odemeMektuplari', reducer });
const withSaga = injectSaga({ key: 'odemeMektuplari', saga });

export default compose(withReducer, withSaga, withConnect)(injectIntl(OdemeMektuplari));

//ork
/* eslint-disable react/no-is-mounted */
/**
 *
 * OdemeMektuplari
 *
 */

import React from 'react';
import PropTypes from 'prop-types';

import injectSaga from 'utils/injectSaga';
import injectReducer from 'utils/injectReducer';
import { injectIntl } from 'react-intl';
import { connect } from 'react-redux';
import { compose } from 'redux';
import { toast } from 'react-toastify';

import { createStructuredSelector } from 'reselect';
import { Form, DataTable, Button, Segment, Grid, Modal, List } from 'tcmb-ui-components';

import reducer from './redux/reducer';
import saga from './redux/saga';
import { mektupTipiOptions, paketTipiOptions } from './redux/utility';
import {
  mektupYazdir,
  searchIhracatci,
  clearIhracatci,
  mektupEpostaGonder,
  mektupTalepSearch,
} from './redux/actions';
import makeSelectOdemeMektuplari from './redux/selectors';
import DropdownKararNo from '../../components/DropdownKararNo';
import DropdownIhracatci from '../../components/DropdownIhracatci';

import { MektupDetayColumns, MektupDetayLogColumns, MektupMainColumns } from './columns';
import ReactJson from 'react-json-view';

/* eslint-disable react/prefer-stateless-function */
const TRAN_STATES = {
  IDLE: 'IDLE',
  WARNING_CHECK: 'WARNING_CHECK',
};

export class OdemeMektuplari extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: false,
      tranState: TRAN_STATES.IDLE,
      clearIhracatciAdi: false,
      onConfirm: null,
      selectedRows: [],
      selectedTaleps: new Set(),

      // Yeni modal state
      isDetailOpen: false,
      detailRow: null,
    };

    this.handlePaginationChange = this.handlePaginationChange.bind(this);
    this.handlePageSizeChange = this.handlePageSizeChange.bind(this);
  }

  // --- helpers ---

  handleIhracatciSelect = (ihracatciAdi) => {
    const ihracatciKodu = (ihracatciAdi.split(' - ')[0] || '').trim();
    if (ihracatciKodu.length === 10) {
      this.setState({ searchVkn: ihracatciKodu, searchTckn: '' });
    } else if (ihracatciKodu.length === 11) {
      this.setState({ searchTckn: ihracatciKodu, searchVkn: '' });
    } else {
      this.setState({ searchTckn: '', searchVkn: '' });
    }
  };

  formatDate = (d) => (d && d.format ? d.format('YYYY-MM-DD') : '');

  // --- actions ---

  mektupTalepSearchFunc = () => {
    this.props.dispatch(
      mektupTalepSearch(
        this.props.odemeMektuplari.activePage,
        this.props.odemeMektuplari.rowCount,
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupEpostaGonderFunc = () => {
    this.props.dispatch(
      mektupEpostaGonder(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupYazdirFields = () => {
    this.props.dispatch(
      mektupYazdir(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  handleSearchIhracatciFields(ihracatciVkn, ihracatciTckn) {
    this.props.dispatch(searchIhracatci(ihracatciVkn, ihracatciTckn));
  }

  handleClearMektupFields = () => {
    this.setState((s) => ({
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: !s.clearKararNo,
      clearIhracatciAdi: !s.clearIhracatciAdi,
    }));
    this.props.dispatch(clearIhracatci());
  };

  // tabloda seçimler
  handleClearList() {
    this.setState({ selectedTaleps: new Set(), selectedRows: [] });
  }

  handleSelectMektupIslemleriFromList(rowsData) {
    const selectedTaleps = new Set();
    const selectedItemsSet = new Set();

    rowsData.forEach((rowData) => {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    });

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  handleSelectMektupIslemleri(rowData, checked) {
    const { selectedTaleps, selectedRows } = this.state;
    const selectedItemsSet = new Set(selectedRows);

    if (checked) {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    } else {
      selectedTaleps.delete(rowData.requestId);
      selectedItemsSet.delete(rowData.id);
    }

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  handlePaginationChange(event, { activePage }) {
    if (activePage !== this.props.odemeMektuplari.activePage) {
      this.props.odemeMektuplari.activePage = activePage;
      this.mektupTalepSearchFunc();
      this.setState({ selectedTaleps: new Set(), selectedRows: [] });
    }
  }

  handlePageSizeChange(event, data) {
    const newPageSize = data.value;
    const newTotalPages = Math.ceil(this.props.odemeMektuplari.size / newPageSize);
    const newActivePage = Math.min(newTotalPages, this.props.odemeMektuplari.activePage);

    this.props.odemeMektuplari.rowCount = newPageSize;
    this.props.odemeMektuplari.totalPages = newTotalPages;
    this.props.odemeMektuplari.activePage = newActivePage;

    this.mektupTalepSearchFunc();
    this.setState({ selectedTaleps: new Set() });
  }

  // --- yeni: çift tıklama ile modal aç
  handleRowDoubleClick = (rowData) => {
    this.setState({
      detailRow: rowData,
      isDetailOpen: true,
    });
  };

  // --- render ---

  render() {
    return (
      <div>
        {this.renderOdemeMektup()}
        {this.renderCheckProcess()}
        {this.renderRowDetailModal()}
      </div>
    );
  }

  renderOdemeMektup() {
    return (
      <div>
        {this.renderSearchOdemeMektup()}
        {this.renderMektupIslemleriTable()}
      </div>
    );
  }

  renderCheckProcess() {
    const { tranState, onConfirm } = this.state;
    if (tranState === TRAN_STATES.IDLE) return null;

    return (
      <Modal open size="tiny">
        <Modal.Content style={{ minHeight: '120px' }}>
          <List relaxed size="large">
            {tranState === TRAN_STATES.WARNING_CHECK && (
              <List.Item>
                <List.Icon name="exclamation triangle" color="yellow" />
                <List.Content>
                  VKN veya TCKN alanları boş! İşleme devam etmeniz durumunda seçilen tarihe ilişkin tüm ödeme mektupları gönderilecektir. Bu
                  işleme devam etmek istediğinize emin misiniz?
                </List.Content>
                <div style={{ marginTop: '15px', textAlign: 'right' }}>
                  <Button color="red" onClick={() => this.setState({ tranState: TRAN_STATES.IDLE, onConfirm: null })}>
                    İptal
                  </Button>
                  <Button
                    color="green"
                    onClick={() => {
                      if (typeof onConfirm === 'function') onConfirm();
                      this.setState({ tranState: TRAN_STATES.IDLE, onConfirm: null });
                    }}
                  >
                    Devam Et
                  </Button>
                </div>
              </List.Item>
            )}
          </List>
        </Modal.Content>
      </Modal>
    );
  }

  renderSearchOdemeMektup = () => (
    <Segment.Group className="tcmb-datatable">
      <Segment className="header-segment">
        <b>Mektup Arama</b>
      </Segment>
      <Segment className="table-segment" />
      <br />
      {/* Arama alanları burada aynı kaldı */}
      {/* ... */}
    </Segment.Group>
  );

  renderMektupIslemleriTable = () => {
    const columnsWithMarker = [...MektupMainColumns];

    return (
      <Segment.Group className="tcmb-datatable">
        <Segment className="header-segment">
          <b>Talep Listesi</b>
        </Segment>

        <DataTable
          loading={this.props.odemeMektuplari.mektupSearchLoading}
          columns={columnsWithMarker}
          resizable
          getRowKey="requestId"
          data={this.props.odemeMektuplari.mektupTalepList || []}
          celled
          selectable
          noResultsMessage="Aradığınız kriterlere uygun kayıt bulunamadı"
          columnMenu
          export={{ fileName: 'Mektup Talep Islemleri', sheetName: 'Sheet 1', types: ['xlsx'] }}
          rowSelection="multiple"
          onRowSelect={this.handleSelectMektupIslemleri}
          onRowsSelect={(rowsData) => {
            if (rowsData && rowsData.length > 0) {
              this.handleSelectMektupIslemleriFromList(rowsData);
            } else {
              this.handleClearList();
            }
          }}
          selectedRows={this.state.selectedRows}
          allRowsSelection
          page
          pagination
          onPageSizeChange={this.handlePageSizeChange}
          paginationProps={{
            totalPages: this.props.odemeMektuplari.totalPages,
            activePage: this.props.odemeMektuplari.activePage,
            onPageChange: this.handlePaginationChange,
          }}
          getRowDetail={(rowData) => (
            <DataTable
              getRowKey="itemId"
              columns={MektupDetayColumns}
              resizable
              data={rowData.itemDTOList}
              celled
              getRowDetail={(rowData2) => (
                <DataTable
                  getRowKey="logId"
                  columns={MektupDetayLogColumns}
                  resizable
                  data={rowData2.notifyLogs}
                  celled
                  getRowDetail={(rowLogData) => (
                    <div>
                      <p>
                        <b>{rowLogData.mailBody}</b>
                      </p>
                    </div>
                  )}
                />
              )}
            />
          )}
          /** YENİ: satıra çift tıklama */
          getRowProps={(rowData) => ({
            onDoubleClick: () => this.handleRowDoubleClick(rowData),
            style: { cursor: 'pointer' },
          })}
        />
      </Segment.Group>
    );
  };

  // Çift tıklama ile açılan modal
  renderRowDetailModal = () => {
    const { isDetailOpen, detailRow } = this.state;
    if (!isDetailOpen) return null;

    return (
      <Modal open size="large" onClose={() => this.setState({ isDetailOpen: false, detailRow: null })}>
        <Modal.Header>
          <b>Talep Detayı</b>
        </Modal.Header>
        <Modal.Content>
          {detailRow ? <ReactJson src={detailRow} name={null} collapsed={2} displayDataTypes={false} /> : null}
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => this.setState({ isDetailOpen: false, detailRow: null })}>Kapat</Button>
        </Modal.Actions>
      </Modal>
    );
  };
}

OdemeMektuplari.propTypes = {
  dispatch: PropTypes.func.isRequired,
  odemeMektuplari: PropTypes.any,
};

const mapStateToProps = createStructuredSelector({
  odemeMektuplari: makeSelectOdemeMektuplari(),
});

function isSearchMektupTipValid(searchMektupTip) {
  return searchMektupTip === '1' || searchMektupTip === '2' || searchMektupTip === '4';
}

function mapDispatchToProps(dispatch) {
  return { dispatch };
}

const withConnect = connect(mapStateToProps, mapDispatchToProps);
const withReducer = injectReducer({ key: 'odemeMektuplari', reducer });
const withSaga = injectSaga({ key: 'odemeMektuplari', saga });

export default compose(withReducer, withSaga, withConnect)(injectIntl(OdemeMektuplari));



///fena
/* eslint-disable react/no-is-mounted */
/**
 *
 * OdemeMektuplari
 *
 */

import React from 'react';
import PropTypes from 'prop-types';

import injectSaga from 'utils/injectSaga';
import injectReducer from 'utils/injectReducer';
import { injectIntl } from 'react-intl';
import { connect } from 'react-redux';
import { compose } from 'redux';
import { toast } from 'react-toastify';

import { createStructuredSelector } from 'reselect';
import { Form, DataTable, Button, Segment, Grid, Modal, List } from 'tcmb-ui-components';

import reducer from './redux/reducer';
import saga from './redux/saga';
import { mektupTipiOptions, paketTipiOptions } from './redux/utility';
import {
  mektupYazdir,
  searchIhracatci,
  clearIhracatci,
  mektupEpostaGonder,
  mektupTalepSearch,
} from './redux/actions';
import makeSelectOdemeMektuplari from './redux/selectors';
import DropdownKararNo from '../../components/DropdownKararNo';
import DropdownIhracatci from '../../components/DropdownIhracatci';

import { MektupDetayColumns, MektupDetayLogColumns, MektupMainColumns } from './columns';
import ReactJson from 'react-json-view';

/* eslint-disable react/prefer-stateless-function */
const TRAN_STATES = {
  IDLE: 'IDLE',
  WARNING_CHECK: 'WARNING_CHECK',
};

export class OdemeMektuplari extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: false,
      tranState: TRAN_STATES.IDLE,
      clearIhracatciAdi: false,
      onConfirm: null, // modal onaylandığında çalıştırılacak aksiyon
      selectedRows: [],
      selectedTaleps: new Set(),

      // ÇİFT TIK DETAY MODAL STATE
      isDetailOpen: false,
      detailRow: null,
    };

    this.handlePaginationChange = this.handlePaginationChange.bind(this);
    this.handlePageSizeChange = this.handlePageSizeChange.bind(this);

    // tablo kapsayıcısı (dblclick) için ref
    this.tableWrapRef = React.createRef();
  }

  // --- helpers ---

  handleIhracatciSelect = (ihracatciAdi) => {
    // "1234567890 - Foo A.Ş." -> "1234567890"
    const ihracatciKodu = (ihracatciAdi.split(' - ')[0] || '').trim();
    if (ihracatciKodu.length === 10) {
      this.setState({ searchVkn: ihracatciKodu, searchTckn: '' });
    } else if (ihracatciKodu.length === 11) {
      this.setState({ searchTckn: ihracatciKodu, searchVkn: '' });
    } else {
      this.setState({ searchTckn: '', searchVkn: '' });
    }
  };

  formatDate = (d) => (d && d.format ? d.format('YYYY-MM-DD') : '');

  // --- actions ---

  mektupTalepSearchFunc = () => {
    this.props.dispatch(
      mektupTalepSearch(
        this.props.odemeMektuplari.activePage,
        this.props.odemeMektuplari.rowCount,
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupEpostaGonderFunc = () => {
    this.props.dispatch(
      mektupEpostaGonder(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupYazdirFields = () => {
    this.props.dispatch(
      mektupYazdir(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  handleSearchIhracatciFields(ihracatciVkn, ihracatciTckn) {
    this.props.dispatch(searchIhracatci(ihracatciVkn, ihracatciTckn));
  }

  handleClearMektupFields = () => {
    this.setState((s) => ({
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: !s.clearKararNo,
      clearIhracatciAdi: !s.clearIhracatciAdi,
    }));
    this.props.dispatch(clearIhracatci());
  };

  // tabloda seçimler
  handleClearList() {
    this.setState({ selectedTaleps: new Set(), selectedRows: [] });
  }

  handleSelectMektupIslemleriFromList(rowsData) {
    const selectedTaleps = new Set();
    const selectedItemsSet = new Set();

    rowsData.forEach((rowData) => {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    });

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  handleSelectMektupIslemleri(rowData, checked) {
    const { selectedTaleps, selectedRows } = this.state;
    const selectedItemsSet = new Set(selectedRows);

    if (checked) {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    } else {
      selectedTaleps.delete(rowData.requestId);
      selectedItemsSet.delete(rowData.id);
    }

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  // --- pagination ---

  handlePaginationChange(event, { activePage }) {
    if (activePage !== this.props.odemeMektuplari.activePage) {
      this.props.odemeMektuplari.activePage = activePage;
      this.mektupTalepSearchFunc();
      this.setState({ selectedTaleps: new Set(), selectedRows: [] });
    }
  }

  handlePageSizeChange(event, data) {
    const newPageSize = data.value;
    const newTotalPages = Math.ceil(this.props.odemeMektuplari.size / newPageSize);
    const newActivePage = Math.min(newTotalPages, this.props.odemeMektuplari.activePage);

    this.props.odemeMektuplari.rowCount = newPageSize;
    this.props.odemeMektuplari.totalPages = newTotalPages;
    this.props.odemeMektuplari.activePage = newActivePage;

    this.mektupTalepSearchFunc();
    this.setState({ selectedTaleps: new Set() });
  }

  // --- dblclick: satırdan requestId okuyup modal aç ---

  handleTableDblClick = (e) => {
    const wrap = this.tableWrapRef.current;
    if (!wrap) return;

    const tr = e.target.closest('tr');
    if (!tr) return;

    // Gizli marker
    const marker = tr.querySelector('span[data-row-id]');
    if (!marker) return;

    const id = marker.getAttribute('data-row-id');
    const data = this.props.odemeMektuplari?.mektupTalepList || [];
    const rowData = data.find((x) => String(x.requestId) === String(id));
    if (!rowData) return;

    this.setState({ detailRow: rowData, isDetailOpen: true });
  };

  // --- render ---

  render() {
    return (
      <div>
        {this.renderOdemeMektup()}
        {this.renderCheckProcess()}
        {this.renderRowDetailModal()}
      </div>
    );
  }

  renderOdemeMektup() {
    return (
      <div>
        {this.renderSearchOdemeMektup()}
        {this.renderMektupIslemleriTable()}
      </div>
    );
  }

  renderCheckProcess() {
    const { tranState, onConfirm } = this.state;
    if (tranState === TRAN_STATES.IDLE) return null;

    return (
      <Modal open size="tiny">
        <Modal.Content style={{ minHeight: '120px' }}>
          <List relaxed size="large">
            {tranState === TRAN_STATES.WARNING_CHECK && (
              <List.Item>
                <List.Icon name="exclamation triangle" color="yellow" />
                <List.Content>
                  VKN veya TCKN alanları boş! İşleme devam etmeniz durumunda seçilen tarihe ilişkin tüm ödeme mektupları gönderilecektir. Bu
                  işleme devam etmek istediğinize emin misiniz?
                </List.Content>
                <div style={{ marginTop: '15px', textAlign: 'right' }}>
                  <Button color="red" onClick={() => this.setState({ tranState: TRAN_STATES.IDLE, onConfirm: null })}>
                    İptal
                  </Button>
                  <Button
                    color="green"
                    onClick={() => {
                      if (typeof onConfirm === 'function') onConfirm();
                      this.setState({ tranState: TRAN_STATES.IDLE, onConfirm: null });
                    }}
                  >
                    Devam Et
                  </Button>
                </div>
              </List.Item>
            )}
          </List>
        </Modal.Content>
      </Modal>
    );
  }

  renderSearchOdemeMektup = () => (
    <Segment.Group className="tcmb-datatable">
      <Segment className="header-segment">
        <b>Mektup Arama</b>
      </Segment>
      <Segment className="table-segment" />
      <br />
      <div className="align-form-fields">
        <Form
          onSubmit={(event, data) => {
            event.preventDefault();

            const errors = data.validateForm();
            const submitterId = event?.nativeEvent?.submitter?.id;

            // Temizle butonu submit değil, ama yine de güvenlik için koruyalım
            if (submitterId === 'btnClearSearchMektup') return;

            if (errors !== null && submitterId !== 'btnMektupSearchNew') {
              toast.error('Lütfen, hatalı alanları düzeltiniz!');
              return;
            }

            switch (submitterId) {
              case 'btnMektupSearchNew':
                this.mektupTalepSearchFunc();
                break;
              case 'btnYazdir':
                this.mektupYazdirFields();
                break;
              case 'btnEmailGonder':
                if (!this.state.searchVkn && !this.state.searchTckn) {
                  this.setState({
                    tranState: TRAN_STATES.WARNING_CHECK,
                    onConfirm: () => this.mektupEpostaGonderFunc(),
                  });
                } else {
                  this.mektupEpostaGonderFunc();
                }
                break;
              default:
                break;
            }
          }}
        >
          <Grid columns="5">
            <Grid.Row>
              <Grid.Column width={5}>
                <Form.Select
                  id="TahakkukSearchTurId"
                  label="Tahakkuk Türü"
                  placeholder=""
                  value={this.state.searchBelgeTip}
                  search
                  clearable
                  onChange={(e, data) => this.setState({ searchBelgeTip: data.value })}
                  options={paketTipiOptions}
                />
              </Grid.Column>

              <Grid.Column width={5}>
                <Form.Input
                  label="Belge No"
                  value={this.state.searchBelgeNo || ''}
                  onChange={(e, data) => this.setState({ searchBelgeNo: data.value })}
                  validation={{
                    rules: [{ type: 'length', max: 10 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>

              <Grid.Column width={4}>
                <Form.Input
                  label="Yıl"
                  type="text"
                  maxLength="4"
                  value={this.state.searchBelgeYil || ''}
                  onChange={(e, data) => this.setState({ searchBelgeYil: data.value })}
                  validation={{
                    rules: [{ type: 'length', max: 4 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={16}>
                <DropdownKararNo
                  onSelect={(value) => this.setState({ searchKararNo: value })}
                  clearTrigger={this.state.clearKararNo}
                />
              </Grid.Column>
              <Grid.Column width={8}>
                <Form.Field>
                  <Form.Datepicker
                    label="İlk Ödeme Tarihi"
                    onChange={(date) => this.setState({ searchOdemeTarih: date })}
                    dateFormat="DD.MM.YYYY"
                    selected={this.state.searchOdemeTarih}
                    showYearDropdown
                    showMonthDropdown
                    todayButton="Bugün"
                    validation={{
                      rules: [{ type: 'required' }],
                      validateOnChange: true,
                      validateOnMount: true,
                      showErrors: 'all',
                    }}
                  />
                </Form.Field>
              </Grid.Column>
              <Grid.Column width={8}>
                <Form.Field>
                  <Form.Datepicker
                    label="Son Ödeme Tarihi"
                    onChange={(date) => this.setState({ searchOdemeTarihSon: date })}
                    dateFormat="DD.MM.YYYY"
                    selected={this.state.searchOdemeTarihSon}
                    showYearDropdown
                    showMonthDropdown
                    todayButton="Bugün"
                    validation={{
                      rules: [{ type: 'required' }],
                      validateOnChange: true,
                      validateOnMount: true,
                      showErrors: 'all',
                    }}
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={8}>
                <Form.Input
                  id="searchIhracatciVkn"
                  label="Firma Vergi Kimlik No"
                  type="text"
                  maxLength="10"
                  value={this.state.searchVkn}
                  disabled={this.state.searchTckn !== ''}
                  onChange={(e, data) => {
                    const v = data.value;
                    this.setState({ searchVkn: v });
                    if (v.length === 10) {
                      this.handleSearchIhracatciFields(v, '');
                    } else {
                      this.props.dispatch(clearIhracatci());
                    }
                  }}
                  validation={{
                    rules: [{ type: 'length', max: 10 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>

              <Grid.Column width={8}>
                <Form.Input
                  id="searchIhracatciTckn"
                  label="Üretici TC Kimlik No"
                  type="text"
                  maxLength="11"
                  value={this.state.searchTckn}
                  disabled={this.state.searchVkn !== ''}
                  onChange={(e, data) => {
                    const t = data.value;
                    this.setState({ searchTckn: t });
                    if (t.length === 11) {
                      this.handleSearchIhracatciFields('', t);
                    } else {
                      this.props.dispatch(clearIhracatci());
                    }
                  }}
                  validation={{
                    rules: [{ type: 'length', max: 11 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>

            <Grid.Row>
              <Grid.Column width={16}>
                <DropdownIhracatci onSelect={this.handleIhracatciSelect} clearTrigger={this.state.clearIhracatciAdi} />
              </Grid.Column>
            </Grid.Row>

            <Grid.Row>
              <Grid.Column width={16}>
                <Form.Select
                  id="mektupTipId"
                  label="Mektup Tipi"
                  placeholder=""
                  value={this.state.searchMektupTip}
                  search
                  clearable
                  onChange={(e, data) => this.setState({ searchMektupTip: data.value })}
                  options={mektupTipiOptions}
                  validation={{
                    rules: [{ type: 'required' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>

            <div className="align-buttons">
              <Grid.Row>
                <Form.Group>
                  <Form.Field>
                    <Button
                      id="btnMektupSearchNew"
                      content="Ara"
                      type="submit"
                      loading={this.props.odemeMektuplari.mektupSearchLoading}
                      className="dfif-button-blue"
                    />
                  </Form.Field>

                  <Form.Field>
                    <Button
                      id="btnClearSearchMektup"
                      content="Temizle"
                      type="button"
                      onClick={this.handleClearMektupFields}
                      className="dfif-button-white"
                    />
                  </Form.Field>

                  <Form.Field>
                    <Button
                      id="btnYazdir"
                      content="Yazdır"
                      type="submit"
                      loading={this.props.odemeMektuplari.mektupYazdirLoading}
                      className="dfif-button-blue"
                    />
                  </Form.Field>

                  {isSearchMektupTipValid(this.state.searchMektupTip) && (
                    <Form.Field>
                      <Button
                        id="btnEmailGonder"
                        content="İhracatçılara Eposta Gönder"
                        type="submit"
                        loading={this.props.odemeMektuplari.mektupEpostaGonderLoading}
                        className="dfif-button-blue"
                      />
                    </Form.Field>
                  )}
                </Form.Group>
              </Grid.Row>
            </div>
          </Grid>
        </Form>
      </div>
    </Segment.Group>
  );

  renderMektupIslemleriTable = () => {
    // Gizli marker sütunu ekliyoruz (çift tıkta doğru satırı bulmak için)
    const columnsWithMarker = [
      ...MektupMainColumns,
      {
        key: '__marker__',
        title: '',
        render: (row) => <span data-row-id={row.requestId} style={{ display: 'none' }} />,
      },
    ];

    return (
      <Segment.Group className="tcmb-datatable">
        <Segment className="header-segment">
          <b>Talep Listesi</b>
        </Segment>

        {/* Çift tıklamayı dış kapsayıcıda dinliyoruz */}
        <div ref={this.tableWrapRef} onDoubleClick={this.handleTableDblClick}>
          <DataTable
            loading={this.props.odemeMektuplari.mektupSearchLoading}
            columns={columnsWithMarker}
            resizable
            getRowKey="requestId"
            data={this.props.odemeMektuplari.mektupTalepList || []}
            celled
            selectable
            noResultsMessage="Aradığınız kriterlere uygun kayıt bulunamadı"
            columnMenu
            export={{ fileName: 'Mektup Talep Islemleri', sheetName: 'Sheet 1', types: ['xlsx'] }}
            rowSelection="multiple"
            onRowSelect={this.handleSelectMektupIslemleri}
            onRowsSelect={(rowsData) => {
              if (rowsData && rowsData.length > 0) {
                this.handleSelectMektupIslemleriFromList(rowsData);
              } else {
                this.handleClearList();
              }
            }}
            selectedRows={this.state.selectedRows}
            allRowsSelection
            page
            pagination
            onPageSizeChange={this.handlePageSizeChange}
            paginationProps={{
              totalPages: this.props.odemeMektuplari.totalPages,
              activePage: this.props.odemeMektuplari.activePage,
              onPageChange: this.handlePaginationChange,
            }}
            getRowDetail={(rowData) => (
              <DataTable
                getRowKey="itemId"
                columns={MektupDetayColumns}
                resizable
                data={rowData.itemDTOList}
                celled
                getRowDetail={(rowData2) => (
                  <DataTable
                    getRowKey="logId"
                    columns={MektupDetayLogColumns}
                    resizable
                    data={rowData2.notifyLogs}
                    celled
                    getRowDetail={(rowLogData) => (
                      <div>
                        <p>
                          <b>{rowLogData.mailBody}</b>
                        </p>
                      </div>
                    )}
                  />
                )}
              />
            )}
          />
        </div>
      </Segment.Group>
    );
  };

  // Çift tıklama ile açılan detay modalı
  renderRowDetailModal = () => {
    const { isDetailOpen, detailRow } = this.state;
    if (!isDetailOpen) return null;

    return (
      <Modal open size="large" onClose={() => this.setState({ isDetailOpen: false, detailRow: null })}>
        <Modal.Header>
          <b>Talep Detayı</b>
        </Modal.Header>
        <Modal.Content>
          {detailRow ? <ReactJson src={detailRow} name={null} collapsed={2} displayDataTypes={false} /> : null}
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => this.setState({ isDetailOpen: false, detailRow: null })}>Kapat</Button>
        </Modal.Actions>
      </Modal>
    );
  };
}

OdemeMektuplari.propTypes = {
  dispatch: PropTypes.func.isRequired,
  odemeMektuplari: PropTypes.any,
};

const mapStateToProps = createStructuredSelector({
  odemeMektuplari: makeSelectOdemeMektuplari(),
});

function isSearchMektupTipValid(searchMektupTip) {
  return searchMektupTip === '1' || searchMektupTip === '2' || searchMektupTip === '4';
}

function mapDispatchToProps(dispatch) {
  return { dispatch };
}

const withConnect = connect(mapStateToProps, mapDispatchToProps);
const withReducer = injectReducer({ key: 'odemeMektuplari', reducer });
const withSaga = injectSaga({ key: 'odemeMektuplari', saga });

export default compose(withReducer, withSaga, withConnect)(injectIntl(OdemeMektuplari));



---serhl
/* eslint-disable react/no-is-mounted */
/**
 *
 * OdemeMektuplari
 *
 */

import React from 'react';
import PropTypes from 'prop-types';

import injectSaga from 'utils/injectSaga';
import injectReducer from 'utils/injectReducer';
import { injectIntl } from 'react-intl';
import { connect } from 'react-redux';
import { compose } from 'redux';
import { toast } from 'react-toastify';

import { createStructuredSelector } from 'reselect';
import { Form, DataTable, Button, Segment, Grid, Modal, List } from 'tcmb-ui-components';

import reducer from './redux/reducer';
import saga from './redux/saga';
import { mektupTipiOptions, paketTipiOptions } from './redux/utility';
import { mektupYazdir, searchIhracatci, clearIhracatci, mektupEpostaGonder,mektupTalepSearch } from './redux/actions';
import makeSelectOdemeMektuplari from './redux/selectors';
import DropdownKararNo from '../../components/DropdownKararNo';
import DropdownIhracatci from '../../components/DropdownIhracatci';

import { MektupDetayColumns, MektupDetayLogColumns, MektupMainColumns } from './columns';
import ReactJson from 'react-json-view';

/* eslint-disable react/prefer-stateless-function */
const TRAN_STATES = {
  IDLE: 'IDLE',
  WARNING_CHECK: 'WARNING_CHECK',
};

export class OdemeMektuplari extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: false,
      tranState: TRAN_STATES.IDLE,
      clearIhracatciAdi: false,
      onConfirm: null, // modal onaylandığında çalıştırılacak aksiyon
      selectedRows: [],
      selectedTaleps: new Set(),
    };
    this.handlePaginationChange = this.handlePaginationChange.bind(this);
    this.handlePageSizeChange = this.handlePageSizeChange.bind(this);
    //this.handleSelectMuhasebeIslemleri = this.handleSelectMuhasebeIslemleri.bind(this);
  }

  // --- helpers ---

  handleIhracatciSelect = (ihracatciAdi) => {
    // "1234567890 - Foo A.Ş." -> "1234567890"
    const ihracatciKodu = (ihracatciAdi.split(' - ')[0] || '').trim();
    if (ihracatciKodu.length === 10) {
      this.setState({ searchVkn: ihracatciKodu, searchTckn: '' });
    } else if (ihracatciKodu.length === 11) {
      this.setState({ searchTckn: ihracatciKodu, searchVkn: '' });
    } else {
      this.setState({ searchTckn: '', searchVkn: '' });
    }
  };

  formatDate = (d) => (d && d.format ? d.format('YYYY-MM-DD') : '');

  // --- actions ---

  mektupTalepSearchFunc = () => {
    this.props.dispatch(
      mektupTalepSearch(
        this.props.odemeMektuplari.activePage,
        this.props.odemeMektuplari.rowCount,
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupEpostaGonderFunc = () => {
    this.props.dispatch(
      mektupEpostaGonder(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupYazdirFields = () => {
    this.props.dispatch(
      mektupYazdir(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  handleSearchIhracatciFields(ihracatciVkn, ihracatciTckn) {
    this.props.dispatch(searchIhracatci(ihracatciVkn, ihracatciTckn));
  }

  handleClearMektupFields = () => {
    this.setState((s) => ({
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: !s.clearKararNo,
      clearIhracatciAdi: !s.clearIhracatciAdi,
    }));
    this.props.dispatch(clearIhracatci());
  };

  // tabloda seçimler
  handleClearList() {
    this.setState({ selectedTaleps: new Set(), selectedRows: [] });
  }

  handleSelectMektupIslemleriFromList(rowsData) {
    const selectedTaleps = new Set();
    const selectedItemsSet = new Set();

    rowsData.forEach((rowData) => {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    });

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  handleSelectMektupIslemleri(rowData, checked) {
    const { selectedTaleps, selectedRows } = this.state;
    const selectedItemsSet = new Set(selectedRows);

    if (checked) {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    } else {
      selectedTaleps.delete(rowData.requestId);
      selectedItemsSet.delete(rowData.id);
    }

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  // opsiyonel: datatable prop'larında referans var ise boş tanımlı kalsın



  handlePaginationChange(event, { activePage }) {
    if (activePage !== this.props.odemeMektuplari.activePage) {
      this.props.odemeMektuplari.activePage = activePage;
      this.mektupTalepSearchFunc();
      this.setState({ selectedTaleps: new Set() });
      this.setState({ selectedRows: [] });
    }
  }

  handlePageSizeChange(event, data) {
    const newPageSize = data.value;
    const newTotalPages = Math.ceil(this.props.odemeMektuplari.size / newPageSize);
    const newActivePage = Math.min(newTotalPages, this.props.odemeMektuplari.activePage);

    this.props.odemeMektuplari.rowCount = newPageSize;
    this.props.odemeMektuplari.totalPages = newTotalPages;
    this.props.odemeMektuplari.activePage = newActivePage;

    this.mektupTalepSearchFunc();
    this.setState({ selectedTaleps: new Set() });
  }



  // --- render ---

  render() {
    return (
      <div>
        {this.renderOdemeMektup()}
        {this.renderCheckProcess()}
      </div>
    );
  }

  renderOdemeMektup() {
    return (
      <div>
        {this.renderSearchOdemeMektup()}
        {this.renderMektupIslemleriTable()}
      </div>
    );
  }

  renderCheckProcess() {
    const { tranState, onConfirm } = this.state;
    if (tranState === TRAN_STATES.IDLE) return null;

    return (
      <Modal open size="tiny">
        <Modal.Content style={{ minHeight: '120px' }}>
          <List relaxed size="large">
            {tranState === TRAN_STATES.WARNING_CHECK && (
              <List.Item>
                <List.Icon name="exclamation triangle" color="yellow" />
                <List.Content>
                  VKN veya TCKN alanları boş! İşleme devam etmeniz durumunda seçilen tarihe ilişkin tüm ödeme mektupları gönderilecektir. Bu
                  işleme devam etmek istediğinize emin misiniz?
                </List.Content>
                <div style={{ marginTop: '15px', textAlign: 'right' }}>
                  <Button color="red" onClick={() => this.setState({ tranState: TRAN_STATES.IDLE, onConfirm: null })}>
                    İptal
                  </Button>
                  <Button
                    color="green"
                    onClick={() => {
                      if (typeof onConfirm === 'function') onConfirm();
                      this.setState({ tranState: TRAN_STATES.IDLE, onConfirm: null });
                    }}
                  >
                    Devam Et
                  </Button>
                </div>
              </List.Item>
            )}
          </List>
        </Modal.Content>
      </Modal>
    );
  }

  renderSearchOdemeMektup = () => (
    <Segment.Group className="tcmb-datatable">
      <Segment className="header-segment">
        <b>Mektup Arama</b>
      </Segment>
      <Segment className="table-segment" />
      <br />
      <div className="align-form-fields">
        <Form
          onSubmit={(event, data) => {
            event.preventDefault();

            const errors = data.validateForm();
            const submitterId = event?.nativeEvent?.submitter?.id;

            // Temizle butonu submit değil, ama yine de güvenlik için koruyalım
            if (submitterId === 'btnClearSearchMektup') return;

            if (errors !== null && submitterId !== 'btnMektupSearchNew') {
              toast.error('Lütfen, hatalı alanları düzeltiniz!');
              return;
            }

            switch (submitterId) {
              case 'btnMektupSearchNew':
                // Arama için validasyon serbest; istersen tarih/mektupTip kontrolü ekleyebilirsin
                this.mektupTalepSearchFunc();
                break;
              case 'btnYazdir':
                this.mektupYazdirFields();
                break;
              case 'btnEmailGonder':
                if (!this.state.searchVkn && !this.state.searchTckn) {
                  this.setState({
                    tranState: TRAN_STATES.WARNING_CHECK,
                    onConfirm: () => this.mektupEpostaGonderFunc(),
                  });
                } else {
                  this.mektupEpostaGonderFunc();
                }
                break;
              default:
                break;
            }
          }}
        >
          <Grid columns="5">
            <Grid.Row>
              <Grid.Column width={5}>
                <Form.Select
                  id="TahakkukSearchTurId"
                  label="Tahakkuk Türü"
                  placeholder=""
                  value={this.state.searchBelgeTip}
                  search
                  clearable
                  onChange={(e, data) => this.setState({ searchBelgeTip: data.value })}
                  options={paketTipiOptions}
                />
              </Grid.Column>

              <Grid.Column width={5}>
                <Form.Input
                  label="Belge No"
                  value={this.state.searchBelgeNo || ''}
                  onChange={(e, data) => this.setState({ searchBelgeNo: data.value })}
                  validation={{
                    rules: [{ type: 'length', max: 10 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>

              <Grid.Column width={4}>
                <Form.Input
                  label="Yıl"
                  type="text"
                  maxLength="4"
                  value={this.state.searchBelgeYil || ''}
                  onChange={(e, data) => this.setState({ searchBelgeYil: data.value })}
                  validation={{
                    rules: [{ type: 'length', max: 4 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={16}>
                <DropdownKararNo
                  onSelect={(value) => this.setState({ searchKararNo: value })}
                  clearTrigger={this.state.clearKararNo}
                />
              </Grid.Column>
              <Grid.Column width={8}>
                <Form.Field>
                  <Form.Datepicker
                    label="İlk Ödeme Tarihi"
                    onChange={(date) => this.setState({ searchOdemeTarih: date })}
                    dateFormat="DD.MM.YYYY"
                    selected={this.state.searchOdemeTarih}
                    showYearDropdown
                    showMonthDropdown
                    todayButton="Bugün"
                    validation={{
                      rules: [{ type: 'required' }],
                      validateOnChange: true,
                      validateOnMount: true,
                      showErrors: 'all',
                    }}
                  />
                </Form.Field>
              </Grid.Column>
              <Grid.Column width={8}>
                <Form.Field>
                  <Form.Datepicker
                    label="Son Ödeme Tarihi"
                    onChange={(date) => this.setState({ searchOdemeTarihSon: date })}
                    dateFormat="DD.MM.YYYY"
                    selected={this.state.searchOdemeTarihSon}
                    showYearDropdown
                    showMonthDropdown
                    todayButton="Bugün"
                    validation={{
                      rules: [{ type: 'required' }],
                      validateOnChange: true,
                      validateOnMount: true,
                      showErrors: 'all',
                    }}
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={8}>
                <Form.Input
                  id="searchIhracatciVkn"
                  label="Firma Vergi Kimlik No"
                  type="text"
                  maxLength="10"
                  value={this.state.searchVkn}
                  disabled={this.state.searchTckn !== ''}
                  onChange={(e, data) => {
                    const v = data.value;
                    this.setState({ searchVkn: v });
                    if (v.length === 10) {
                      this.handleSearchIhracatciFields(v, '');
                    } else {
                      this.props.dispatch(clearIhracatci());
                    }
                  }}
                  validation={{
                    rules: [{ type: 'length', max: 10 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>

              <Grid.Column width={8}>
                <Form.Input
                  id="searchIhracatciTckn"
                  label="Üretici TC Kimlik No"
                  type="text"
                  maxLength="11"
                  value={this.state.searchTckn}
                  disabled={this.state.searchVkn !== ''}
                  onChange={(e, data) => {
                    const t = data.value;
                    this.setState({ searchTckn: t });
                    if (t.length === 11) {
                      this.handleSearchIhracatciFields('', t);
                    } else {
                      this.props.dispatch(clearIhracatci());
                    }
                  }}
                  validation={{
                    rules: [{ type: 'length', max: 11 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>

            <Grid.Row>
              <Grid.Column width={16}>
                <DropdownIhracatci
                  onSelect={this.handleIhracatciSelect}
                  clearTrigger={this.state.clearIhracatciAdi}
                />
              </Grid.Column>
            </Grid.Row>

            <Grid.Row>
              <Grid.Column width={16}>
                <Form.Select
                  id="mektupTipId"
                  label="Mektup Tipi"
                  placeholder=""
                  value={this.state.searchMektupTip}
                  search
                  clearable
                  onChange={(e, data) => this.setState({ searchMektupTip: data.value })}
                  options={mektupTipiOptions}
                  validation={{
                    rules: [{ type: 'required' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>

            <div className="align-buttons">
              <Grid.Row>
                <Form.Group>
                  <Form.Field>
                    <Button
                      id="btnMektupSearchNew"
                      content="Ara"
                      type="submit"
                      loading={this.props.odemeMektuplari.mektupSearchLoading}
                      className="dfif-button-blue"
                    />
                  </Form.Field>

                  <Form.Field>
                    <Button
                      id="btnClearSearchMektup"
                      content="Temizle"
                      type="button"
                      onClick={this.handleClearMektupFields}
                      className="dfif-button-white"
                    />
                  </Form.Field>

                  <Form.Field>
                    <Button
                      id="btnYazdir"
                      content="Yazdır"
                      type="submit"
                      loading={this.props.odemeMektuplari.mektupYazdirLoading}
                      className="dfif-button-blue"
                    />
                  </Form.Field>

                  {isSearchMektupTipValid(this.state.searchMektupTip) && (
                    <Form.Field>
                      <Button
                        id="btnEmailGonder"
                        content="İhracatçılara Eposta Gönder"
                        type="submit"
                        loading={this.props.odemeMektuplari.mektupEpostaGonderLoading}
                        className="dfif-button-blue"
                      />
                    </Form.Field>
                  )}
                </Form.Group>
              </Grid.Row>
            </div>
          </Grid>
        </Form>
      </div>
    </Segment.Group>
  );

  renderMektupIslemleriTable = () => (
    <Segment.Group className="tcmb-datatable">
      <Segment className="header-segment">
        <b>Talep Listesi</b>
      </Segment>

      <DataTable
        loading={this.props.odemeMektuplari.mektupSearchLoading}
        columns={MektupMainColumns}
        resizable
        getRowKey="requestId"
        data={this.props.odemeMektuplari.mektupTalepList || []}
        celled
        selectable
        noResultsMessage="Aradığınız kriterlere uygun kayıt bulunamadı"
        columnMenu
        export={{ fileName: 'Mektup Talep Islemleri', sheetName: 'Sheet 1', types: ['xlsx'] }}
        rowSelection="multiple"
        onRowSelect={this.handleSelectMektupIslemleri}
        onRowsSelect={(rowsData) => {
          if (rowsData && rowsData.length > 0) {
            this.handleSelectMektupIslemleriFromList(rowsData);
          } else {
            this.handleClearList();
          }
        }}
        selectedRows={this.state.selectedRows}
        allRowsSelection
        page
        pagination
        onPageSizeChange={this.handlePageSizeChange}
        paginationProps={{
          totalPages: this.props.odemeMektuplari.totalPages,
          activePage: this.props.odemeMektuplari.activePage,
          onPageChange: this.handlePaginationChange,
        }}
        getRowDetail={(rowData) => (
          <DataTable
            getRowKey="itemId"
            columns={MektupDetayColumns}
            resizable
            data={rowData.itemDTOList}
            celled
            getRowDetail={(rowData) => (
              <DataTable
                getRowKey="logId"
                columns={MektupDetayLogColumns}
                resizable
                data={rowData.notifyLogs}
                celled
                getRowDetail={rowLogData => (
                  <div>
                    <p>
                      <b>{rowLogData.mailBody}</b>
                    </p>
                  </div>
                )}
              />
            )}
          />
        )}
      />
    </Segment.Group>
  );
}

OdemeMektuplari.propTypes = {
  dispatch: PropTypes.func.isRequired,
  odemeMektuplari: PropTypes.any,
};

const mapStateToProps = createStructuredSelector({
  odemeMektuplari: makeSelectOdemeMektuplari(),
});

function isSearchMektupTipValid(searchMektupTip) {
  return searchMektupTip === '1' || searchMektupTip === '2' || searchMektupTip === '4';
}

function mapDispatchToProps(dispatch) {
  return { dispatch };
}

const withConnect = connect(mapStateToProps, mapDispatchToProps);
const withReducer = injectReducer({ key: 'odemeMektuplari', reducer });
const withSaga = injectSaga({ key: 'odemeMektuplari', saga });

export default compose(withReducer, withSaga, withConnect)(injectIntl(OdemeMektuplari));




sonnnnn


/* eslint-disable react/no-is-mounted */
/**
 *
 * OdemeMektuplari
 *
 */

import React from 'react';
import PropTypes from 'prop-types';

import injectSaga from 'utils/injectSaga';
import injectReducer from 'utils/injectReducer';
import { injectIntl } from 'react-intl';
import { connect } from 'react-redux';
import { compose } from 'redux';
import { toast } from 'react-toastify';

import { createStructuredSelector } from 'reselect';
import { Form, DataTable, Button, Segment, Grid, Modal, List } from 'tcmb-ui-components';

import reducer from './redux/reducer';
import saga, { mektupTalepSearch } from './redux/saga';
import { mektupTipiOptions, paketTipiOptions } from './redux/utility';
import { mektupYazdir, searchIhracatci, clearIhracatci, mektupEpostaGonder } from './redux/actions';
import makeSelectOdemeMektuplari from './redux/selectors';
import DropdownKararNo from '../../components/DropdownKararNo';
import DropdownIhracatci from '../../components/DropdownIhracatci';

import { MektupDetayColumns, MektupMainColumns } from './columns';

/* eslint-disable react/prefer-stateless-function */
const TRAN_STATES = {
  IDLE: 'IDLE',
  WARNING_CHECK: 'WARNING_CHECK',
};

export class OdemeMektuplari extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: false,
      tranState: TRAN_STATES.IDLE,
      clearIhracatciAdi: false,
      onConfirm: null, // modal onaylandığında çalıştırılacak aksiyon
      selectedRows: [],
      selectedTaleps: new Set(),
    };
  }

  // --- helpers ---

  handleIhracatciSelect = (ihracatciAdi) => {
    // "1234567890 - Foo A.Ş." -> "1234567890"
    const ihracatciKodu = (ihracatciAdi.split(' - ')[0] || '').trim();
    if (ihracatciKodu.length === 10) {
      this.setState({ searchVkn: ihracatciKodu, searchTckn: '' });
    } else if (ihracatciKodu.length === 11) {
      this.setState({ searchTckn: ihracatciKodu, searchVkn: '' });
    } else {
      this.setState({ searchTckn: '', searchVkn: '' });
    }
  };

  formatDate = (d) => (d && d.format ? d.format('YYYY-MM-DD') : '');

  // --- actions ---

  mektupTalepSearchFunc = () => {
    this.props.dispatch(
      mektupTalepSearch(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupEpostaGonderFunc = () => {
    this.props.dispatch(
      mektupEpostaGonder(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  mektupYazdirFields = () => {
    this.props.dispatch(
      mektupYazdir(
        this.state.searchKararNo,
        this.state.searchBelgeTip,
        this.state.searchBelgeNo,
        this.state.searchBelgeYil,
        this.formatDate(this.state.searchOdemeTarih),
        this.formatDate(this.state.searchOdemeTarihSon),
        this.state.searchVkn,
        this.state.searchTckn,
        this.state.searchMektupTip
      )
    );
  };

  handleSearchIhracatciFields(ihracatciVkn, ihracatciTckn) {
    this.props.dispatch(searchIhracatci(ihracatciVkn, ihracatciTckn));
  }

  handleClearMektupFields = () => {
    this.setState((s) => ({
      searchKararNo: '',
      searchBelgeTip: '',
      searchBelgeNo: '',
      searchBelgeYil: '',
      searchOdemeTarih: '',
      searchOdemeTarihSon: '',
      searchVkn: '',
      searchTckn: '',
      searchMektupTip: '',
      clearKararNo: !s.clearKararNo,
      clearIhracatciAdi: !s.clearIhracatciAdi,
    }));
    this.props.dispatch(clearIhracatci());
  };

  // tabloda seçimler
  handleClearList() {
    this.setState({ selectedTaleps: new Set(), selectedRows: [] });
  }

  handleSelectMektupIslemleriFromList(rowsData) {
    const selectedTaleps = new Set();
    const selectedItemsSet = new Set();

    rowsData.forEach((rowData) => {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    });

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  handleSelectMektupIslemleri(rowData, checked) {
    const { selectedTaleps, selectedRows } = this.state;
    const selectedItemsSet = new Set(selectedRows);

    if (checked) {
      selectedTaleps.add(rowData.requestId);
      selectedItemsSet.add(rowData.id);
    } else {
      selectedTaleps.delete(rowData.requestId);
      selectedItemsSet.delete(rowData.id);
    }

    this.setState({ selectedTaleps, selectedRows: Array.from(selectedItemsSet) });
  }

  // opsiyonel: datatable prop'larında referans var ise boş tanımlı kalsın
  handlePageSizeChange = () => {};
  handlePaginationChange = () => {};

  // --- render ---

  render() {
    return (
      <div>
        {this.renderOdemeMektup()}
        {this.renderCheckProcess()}
      </div>
    );
  }

  renderOdemeMektup() {
    return (
      <div>
        {this.renderSearchOdemeMektup()}
        {this.renderMektupIslemleriTable()}
      </div>
    );
  }

  renderCheckProcess() {
    const { tranState, onConfirm } = this.state;
    if (tranState === TRAN_STATES.IDLE) return null;

    return (
      <Modal open size="tiny">
        <Modal.Content style={{ minHeight: '120px' }}>
          <List relaxed size="large">
            {tranState === TRAN_STATES.WARNING_CHECK && (
              <List.Item>
                <List.Icon name="exclamation triangle" color="yellow" />
                <List.Content>
                  VKN veya TCKN alanları boş! İşleme devam etmeniz durumunda seçilen tarihe ilişkin tüm ödeme mektupları gönderilecektir. Bu
                  işleme devam etmek istediğinize emin misiniz?
                </List.Content>
                <div style={{ marginTop: '15px', textAlign: 'right' }}>
                  <Button color="red" onClick={() => this.setState({ tranState: TRAN_STATES.IDLE, onConfirm: null })}>
                    İptal
                  </Button>
                  <Button
                    color="green"
                    onClick={() => {
                      if (typeof onConfirm === 'function') onConfirm();
                      this.setState({ tranState: TRAN_STATES.IDLE, onConfirm: null });
                    }}
                  >
                    Devam Et
                  </Button>
                </div>
              </List.Item>
            )}
          </List>
        </Modal.Content>
      </Modal>
    );
  }

  renderSearchOdemeMektup = () => (
    <Segment.Group className="tcmb-datatable">
      <Segment className="header-segment">
        <b>Mektup Arama</b>
      </Segment>
      <Segment className="table-segment" />
      <br />
      <div className="align-form-fields">
        <Form
          onSubmit={(event, data) => {
            event.preventDefault();

            const errors = data.validateForm();
            const submitterId = event?.nativeEvent?.submitter?.id;

            // Temizle butonu submit değil, ama yine de güvenlik için koruyalım
            if (submitterId === 'btnClearSearchMektup') return;

            if (errors !== null && submitterId !== 'btnMektupSearchNew') {
              toast.error('Lütfen, hatalı alanları düzeltiniz!');
              return;
            }

            switch (submitterId) {
              case 'btnMektupSearchNew':
                // Arama için validasyon serbest; istersen tarih/mektupTip kontrolü ekleyebilirsin
                this.mektupTalepSearchFunc();
                break;
              case 'btnYazdir':
                this.mektupYazdirFields();
                break;
              case 'btnEmailGonder':
                if (!this.state.searchVkn && !this.state.searchTckn) {
                  this.setState({
                    tranState: TRAN_STATES.WARNING_CHECK,
                    onConfirm: () => this.mektupEpostaGonderFunc(),
                  });
                } else {
                  this.mektupEpostaGonderFunc();
                }
                break;
              default:
                break;
            }
          }}
        >
          <Grid columns="5">
            <Grid.Row>
              <Grid.Column width={5}>
                <Form.Select
                  id="TahakkukSearchTurId"
                  label="Tahakkuk Türü"
                  placeholder=""
                  value={this.state.searchBelgeTip}
                  search
                  clearable
                  onChange={(e, data) => this.setState({ searchBelgeTip: data.value })}
                  options={paketTipiOptions}
                />
              </Grid.Column>

              <Grid.Column width={5}>
                <Form.Input
                  label="Belge No"
                  value={this.state.searchBelgeNo || ''}
                  onChange={(e, data) => this.setState({ searchBelgeNo: data.value })}
                  validation={{
                    rules: [{ type: 'length', max: 10 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>

              <Grid.Column width={4}>
                <Form.Input
                  label="Yıl"
                  type="text"
                  maxLength="4"
                  value={this.state.searchBelgeYil || ''}
                  onChange={(e, data) => this.setState({ searchBelgeYil: data.value })}
                  validation={{
                    rules: [{ type: 'length', max: 4 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>

            <Grid.Row>
              <Grid.Column width={16}>
                <DropdownKararNo
                  onSelect={(value) => this.setState({ searchKararNo: value })}
                  clearTrigger={this.state.clearKararNo}
                />
              </Grid.Column>

              <Grid.Column width={8}>
                <Form.Field>
                  <Form.Datepicker
                    label="İlk Ödeme Tarihi"
                    onChange={(date) => this.setState({ searchOdemeTarih: date })}
                    dateFormat="DD.MM.YYYY"
                    selected={this.state.searchOdemeTarih}
                    showYearDropdown
                    showMonthDropdown
                    todayButton="Bugün"
                    validation={{
                      rules: [{ type: 'required' }],
                      validateOnChange: true,
                      validateOnMount: true,
                      showErrors: 'all',
                    }}
                  />
                </Form.Field>
              </Grid.Column>

              <Grid.Column width={8}>
                <Form.Field>
                  <Form.Datepicker
                    label="Son Ödeme Tarihi"
                    onChange={(date) => this.setState({ searchOdemeTarihSon: date })}
                    dateFormat="DD.MM.YYYY"
                    selected={this.state.searchOdemeTarihSon}
                    showYearDropdown
                    showMonthDropdown
                    todayButton="Bugün"
                    validation={{
                      rules: [{ type: 'required' }],
                      validateOnChange: true,
                      validateOnMount: true,
                      showErrors: 'all',
                    }}
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>

            <Grid.Row>
              <Grid.Column width={8}>
                <Form.Input
                  id="searchIhracatciVkn"
                  label="Firma Vergi Kimlik No"
                  type="text"
                  maxLength="10"
                  value={this.state.searchVkn}
                  disabled={this.state.searchTckn !== ''}
                  onChange={(e, data) => {
                    const v = data.value;
                    this.setState({ searchVkn: v });
                    if (v.length === 10) {
                      this.handleSearchIhracatciFields(v, '');
                    } else {
                      this.props.dispatch(clearIhracatci());
                    }
                  }}
                  validation={{
                    rules: [{ type: 'length', max: 10 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>

              <Grid.Column width={8}>
                <Form.Input
                  id="searchIhracatciTckn"
                  label="Üretici TC Kimlik No"
                  type="text"
                  maxLength="11"
                  value={this.state.searchTckn}
                  disabled={this.state.searchVkn !== ''}
                  onChange={(e, data) => {
                    const t = data.value;
                    this.setState({ searchTckn: t });
                    if (t.length === 11) {
                      this.handleSearchIhracatciFields('', t);
                    } else {
                      this.props.dispatch(clearIhracatci());
                    }
                  }}
                  validation={{
                    rules: [{ type: 'length', max: 11 }, { type: 'numeric' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>

            <Grid.Row>
              <Grid.Column width={16}>
                <DropdownIhracatci
                  onSelect={this.handleIhracatciSelect}
                  clearTrigger={this.state.clearIhracatciAdi}
                />
              </Grid.Column>
            </Grid.Row>

            <Grid.Row>
              <Grid.Column width={16}>
                <Form.Select
                  id="mektupTipId"
                  label="Mektup Tipi"
                  placeholder=""
                  value={this.state.searchMektupTip}
                  search
                  clearable
                  onChange={(e, data) => this.setState({ searchMektupTip: data.value })}
                  options={mektupTipiOptions}
                  validation={{
                    rules: [{ type: 'required' }],
                    validateOnChange: true,
                    validateOnMount: true,
                    showErrors: 'all',
                  }}
                />
              </Grid.Column>
            </Grid.Row>

            <div className="align-buttons">
              <Grid.Row>
                <Form.Group>
                  <Form.Field>
                    <Button
                      id="btnMektupSearchNew"
                      content="Ara"
                      type="submit"
                      loading={this.props.odemeMektuplari.mektupSearchLoading}
                      className="dfif-button-blue"
                    />
                  </Form.Field>

                  <Form.Field>
                    <Button
                      id="btnClearSearchMektup"
                      content="Temizle"
                      type="button"
                      onClick={this.handleClearMektupFields}
                      className="dfif-button-white"
                    />
                  </Form.Field>

                  <Form.Field>
                    <Button
                      id="btnYazdir"
                      content="Yazdır"
                      type="submit"
                      loading={this.props.odemeMektuplari.mektupYazdirLoading}
                      className="dfif-button-blue"
                    />
                  </Form.Field>

                  {isSearchMektupTipValid(this.state.searchMektupTip) && (
                    <Form.Field>
                      <Button
                        id="btnEmailGonder"
                        content="İhracatçılara Eposta Gönder"
                        type="submit"
                        loading={this.props.odemeMektuplari.mektupEpostaGonderLoading}
                        className="dfif-button-blue"
                      />
                    </Form.Field>
                  )}
                </Form.Group>
              </Grid.Row>
            </div>
          </Grid>
        </Form>
      </div>
    </Segment.Group>
  );

  renderMektupIslemleriTable = () => (
    <Segment.Group className="tcmb-datatable">
      <Segment className="header-segment">
        <b>Talep Listesi</b>
      </Segment>

      <DataTable
        loading={this.props.odemeMektuplari.mektupSearchLoading}
        columns={MektupMainColumns}
        resizable
        getRowKey="requestId"
        data={this.props.odemeMektuplari.mektupTalepList || []}
        celled
        selectable
        noResultsMessage="Aradığınız kriterlere uygun kayıt bulunamadı"
        columnMenu
        export={{ fileName: 'Mektup Talep Islemleri', sheetName: 'Sheet 1', types: ['xlsx'] }}
        rowSelection="multiple"
        onRowSelect={this.handleSelectMektupIslemleri}
        onRowsSelect={(rowsData) => {
          if (rowsData && rowsData.length > 0) {
            this.handleSelectMektupIslemleriFromList(rowsData);
          } else {
            this.handleClearList();
          }
        }}
        selectedRows={this.state.selectedRows}
        allRowsSelection
        page
        pagination
        onPageSizeChange={this.handlePageSizeChange}
        getRowDetail={(rowData) => (
          <DataTable
            getRowKey="itemId"
            columns={MektupDetayColumns}
            resizable
            data={rowData.mektupItemDTOList}
            celled
          />
        )}
      />
    </Segment.Group>
  );
}

OdemeMektuplari.propTypes = {
  dispatch: PropTypes.func.isRequired,
  odemeMektuplari: PropTypes.any,
};

const mapStateToProps = createStructuredSelector({
  odemeMektuplari: makeSelectOdemeMektuplari(),
});

function isSearchMektupTipValid(searchMektupTip) {
  return searchMektupTip === '1' || searchMektupTip === '2' || searchMektupTip === '4';
}

function mapDispatchToProps(dispatch) {
  return { dispatch };
}

const withConnect = connect(mapStateToProps, mapDispatchToProps);
const withReducer = injectReducer({ key: 'odemeMektuplari', reducer });
const withSaga = injectSaga({ key: 'odemeMektuplari', saga });

export default compose(withReducer, withSaga, withConnect)(injectIntl(OdemeMektuplari));


yunus
----










@Modifying
    @Query(value = "UPDATE letter_request SET status_id = 4, processing_started_at = now(), updated_at = now(), attempt_count = attempt_count + 1, last_attempt_at = now() WHERE id = :id AND status_id IN (3,4)", nativeQuery = true)
    int markProcessing(@Param("id") UUID id);



Hibernate: UPDATE letter_request SET status_id = 4, processing_started_at = now(), updated_at = now(), attempt_count = attempt_count + 1, last_attempt_at = now() WHERE id = ? AND status_id IN (3,4)
javax.persistence.TransactionRequiredException: Executing an update/delete query
	at org.hibernate.internal.AbstractSharedSessionContract.checkTransactionNeededForUpdateOperation(AbstractSharedSessionContract.java:422)
	at org.hibernate.query.internal.AbstractProducedQuery.executeUpdate(AbstractProducedQuery.java:1668)
	at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
	at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)
	at java.base/jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
	at java.base/java.lang.reflect.Method.invoke(Method.java:566)
	at org.springframework.orm.jpa.SharedEntityManagerCreator$DeferredQueryInvocationHandler.invoke(SharedEntityManagerCreator.java:406)
	at com.sun.proxy.$Proxy264.executeUpdate(Unknown Source)
	at org.springframework.data.jpa.repository.query.JpaQueryExecution$ModifyingExecution.doExecute(JpaQueryExecution.java:239)
	at org.springframework.data.jpa.repository.query.JpaQueryExecution.execute(JpaQueryExecution.java:88)
	at org.springframework.data.jpa.repository.query.AbstractJpaQuery.doExecute(AbstractJpaQuery.java:155)
	at org.springframework.data.jpa.repository.query.AbstractJpaQuery.execute(AbstractJpaQuery.java:143)
	at org.springframework.data.repository.core.support.RepositoryMethodInvoker.doInvoke(RepositoryMethodInvoker.java:137)
	at org.springframework.data.repository.core.support.RepositoryMethodInvoker.invoke(RepositoryMethodInvoker.java:121)
	at org.springframework.data.repository.core.support.QueryExecutorMethodInterceptor.doInvoke(QueryExecutorMethodInterceptor.java:152)
	at org.springframework.data.repository.core.support.QueryExecutorMethodInterceptor.invoke(QueryExecutorMethodInterceptor.java:131)
	at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:186)
	at org.springframework.data.projection.DefaultMethodInvokingMethodInterceptor.invoke(DefaultMethodInvokingMethodInterceptor.java:80)
	at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:186)
	at org.springframework.transaction.interceptor.TransactionInterceptor$1.proceedWithInvocation(TransactionInterceptor.java:123)
	at org.springframework.transaction.interceptor.TransactionAspectSupport.invokeWithinTransaction(TransactionAspectSupport.java:388)
	at org.springframework.transaction.interceptor.TransactionInterceptor.invoke(TransactionInterceptor.java:119)
	at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:186)
	at org.springframework.dao.support.PersistenceExceptionTranslationInterceptor.invoke(PersistenceExceptionTranslationInterceptor.java:137)
	at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:186)
	at org.springframework.data.jpa.repository.support.CrudMethodMetadataPostProcessor$CrudMethodMetadataPopulatingMethodInterceptor.invoke(CrudMethodMetadataPostProcessor.java:145)
	at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:186)
	at org.springframework.aop.interceptor.ExposeInvocationInterceptor.invoke(ExposeInvocationInterceptor.java:97)
	at org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(ReflectiveMethodInvocation.java:186)
	at org.springframework.aop.framework.JdkDynamicAopProxy.invoke(JdkDynamicAopProxy.java:215)
	at com.sun.proxy.$Proxy225.insertIfNotExists(Unknown Source)
	at tr.gov.tcmb.ogmdfif.service.impl.LetterProcessingJob.lambda$ensureItemsExist$1(LetterProcessingJob.java:97)
	at java.base/java.lang.Iterable.forEach(Iterable.java:75)
	at tr.gov.tcmb.ogmdfif.service.impl.LetterProcessingJob.ensureItemsExist(LetterProcessingJob.java:96)
	at tr.gov.tcmb.ogmdfif.service.impl.LetterProcessingJob.processOneRequestSafe(LetterProcessingJob.java:65)
	at tr.gov.tcmb.ogmdfif.service.impl.LetterProcessingJob.runBatch(LetterProcessingJob.java:46)
	at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
	at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)
	at java.base/jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
	at java.base/java.lang.reflect.Method.invoke(Method.java:566)
	at org.springframework.scheduling.support.ScheduledMethodRunnable.run(ScheduledMethodRunnable.java:84)
	at org.springframework.scheduling.support.DelegatingErrorHandlingRunnable.run(DelegatingErrorHandlingRunnable.java:54)
	at java.base/java.util.concurrent.Executors$RunnableAdapter.call(Executors.java:515)
	at java.base/java.util.concurrent.FutureTask.runAndReset$$$capture(FutureTask.java:305)
	at java.base/java.util.concurrent.FutureTask.runAndReset(FutureTask.java)
	at --- Async.Stack.Trace --- (captured by IntelliJ IDEA debugger)
	at java.base/java.util.concurrent.FutureTask.<init>(FutureTask.java:151)
	at java.base/java.util.concurrent.ScheduledThreadPoolExecutor$ScheduledFutureTask.<init>(ScheduledThreadPoolExecutor.java:227)
	at java.base/java.util.concurrent.ScheduledThreadPoolExecutor.scheduleWithFixedDelay(ScheduledThreadPoolExecutor.java:677)
	at org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler.scheduleWithFixedDelay(ThreadPoolTaskScheduler.java:389)
	at org.springframework.scheduling.config.ScheduledTaskRegistrar.scheduleFixedDelayTask(ScheduledTaskRegistrar.java:528)
	at org.springframework.scheduling.config.ScheduledTaskRegistrar.scheduleFixedDelayTask(ScheduledTaskRegistrar.java:502)
	at org.springframework.scheduling.config.ScheduledTaskRegistrar.scheduleTasks(ScheduledTaskRegistrar.java:379)
	at org.springframework.scheduling.config.ScheduledTaskRegistrar.afterPropertiesSet(ScheduledTaskRegistrar.java:349)
	at org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor.finishRegistration(ScheduledAnnotationBeanPostProcessor.java:314)
	at org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor.onApplicationEvent(ScheduledAnnotationBeanPostProcessor.java:233)
	at org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor.onApplicationEvent(ScheduledAnnotationBeanPostProcessor.java:105)
	at org.springframework.context.event.SimpleApplicationEventMulticaster.doInvokeListener(SimpleApplicationEventMulticaster.java:176)
	at org.springframework.context.event.SimpleApplicationEventMulticaster.invokeListener(SimpleApplicationEventMulticaster.java:169)
	at org.springframework.context.event.SimpleApplicationEventMulticaster.multicastEvent(SimpleApplicationEventMulticaster.java:143)
	at org.springframework.context.support.AbstractApplicationContext.publishEvent(AbstractApplicationContext.java:420)
	at org.springframework.context.support.AbstractApplicationContext.publishEvent(AbstractApplicationContext.java:377)
	at org.springframework.context.support.AbstractApplicationContext.finishRefresh(AbstractApplicationContext.java:937)
	at org.springframework.context.support.AbstractApplicationContext.refresh(AbstractApplicationContext.java:585)
	at org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext.refresh(ServletWebServerApplicationContext.java:144)
	at org.springframework.boot.SpringApplication.refresh(SpringApplication.java:767)
	at org.springframework.boot.SpringApplication.refresh(SpringApplication.java:759)
	at org.springframework.boot.SpringApplication.refreshContext(SpringApplication.java:426)
	at org.springframework.boot.SpringApplication.run(SpringApplication.java:326)
	at org.springframework.boot.SpringApplication.run(SpringApplication.java:1311)
	at org.springframework.boot.SpringApplication.run(SpringApplication.java:1300)
	at tr.gov.tcmb.ogmdfif.OgmdfifApplication.main(OgmdfifApplication.java:42)
	at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
	at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)
	at java.base/jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
	at java.base/java.lang.reflect.Method.invoke(Method.java:566)
	at org.springframework.boot.devtools.restart.RestartLauncher.run(RestartLauncher.java:49)
"}







------------









CREATE TABLE letter_item (
    id                  BIGSERIAL PRIMARY KEY,
    request_id          UUID NOT NULL REFERENCES letter_request(id) ON DELETE CASCADE,
    receiver_key        VARCHAR(64) NOT NULL,
    payload_ref         VARCHAR(200),
    status_id           SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    attempt_count       SMALLINT NOT NULL DEFAULT 0,
    last_error_code     VARCHAR(64),
    last_error_message  TEXT,
    sent_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performans indexleri
CREATE INDEX idx_letter_item_req_status ON letter_item (request_id, status_id);
CREATE INDEX idx_letter_item_req ON letter_item (request_id);





@Entity
@Table(name = "letter_item")
@Getter
@Setter
public class LetterItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "request_id", nullable = false)
    private UUID requestId;

    @Column(name = "receiver_key", nullable = false)
    private String receiverKey;

    @Column(name = "payload_ref")
    private String payloadRef;

    @Column(name = "status_id", nullable = false)
    private Short statusId;

    @Column(name = "attempt_count", nullable = false)
    private Short attemptCount = 0;

    @Column(name = "last_error_code")
    private String lastErrorCode;

    @Column(name = "last_error_message")
    private String lastErrorMessage;

    @Column(name = "sent_at")
    private OffsetDateTime sentAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();
}











# coin-calculate-app-ui


### Running process with pnpm:
```
pnpm install
```

### Compiles and hot-reloads for development
```
pnpm run serve
```

### npm+docker run process:
```
docker build -t sg-vue-ui .
docker run -d --name vueui -p 80:80 sg-vue-ui

```



### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).



----- 1) Mektup Tipleri
CREATE TABLE ref_letter_request_type (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
-- PK zaten id'yi indexler
-- UNIQUE(name) indexi de rapor/sorgu hızlandırır
CREATE INDEX idx_ref_letter_request_type_name ON ref_letter_request_type(name);

INSERT INTO ref_letter_request_type (id, name) VALUES
(1, 'ODEME'),
(2, 'HAKEDIS_DEVIR'),
(3, 'DAVET');

-------------------------------------------------

-- 2) Scope Tipleri
CREATE TABLE ref_letter_scope (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
CREATE INDEX idx_ref_letter_scope_name ON ref_letter_scope(name);

INSERT INTO ref_letter_scope (id, name) VALUES
(1, 'BULK'),
(2, 'SINGLE'),


-------------------------------------------------

-- 3) Status Tipleri
CREATE TABLE ref_letter_status (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
CREATE INDEX idx_ref_letter_status_name ON ref_letter_status(name);

INSERT INTO ref_letter_status (id, name) VALUES
(1, 'PENDING'),
(2, 'VALIDATION_FAIL'),
(3, 'READY'),
(4, 'PROCESSING'),
(5, 'PARTIAL_SENT'),
(6, 'SENT'),
(7, 'FAILED'),
(8, 'CANCELLED');
------------------------------------------------------------------


CREATE TABLE letter_request (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Lookup tablolarına FK
    request_type_id         SMALLINT NOT NULL REFERENCES ref_letter_request_type(id),
    scope_id                SMALLINT NOT NULL REFERENCES ref_letter_scope(id),
    scope_value             VARCHAR(20),

    -- Zorunlu alanlar
    first_payment_date      DATE     NOT NULL,
    last_payment_date       DATE     NOT NULL,

    -- Opsiyonel alanlar (ekrandan gelebilecek)
    tahakkuk_turu           VARCHAR(50),
    belge_no                VARCHAR(50),
    yil                     INTEGER,
    karar_no_adi            VARCHAR(200),
    firma_vkn               VARCHAR(20),
    uretici_tckn            VARCHAR(20),
    ihracatci_unvan         VARCHAR(250),
    mektup_tipi_ui          VARCHAR(100),

    -- Durum
    status_id               SMALLINT NOT NULL REFERENCES ref_letter_status(id),

    -- Audit bilgileri
    created_by              VARCHAR(64) NOT NULL,
    branch_id               VARCHAR(32) NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updater                 VARCHAR(64),

    -- Gönderim deneme bilgileri
    attempt_count           SMALLINT NOT NULL DEFAULT 0,
    last_attempt_at         TIMESTAMPTZ,
    next_attempt_at         TIMESTAMPTZ,
    processing_started_at   TIMESTAMPTZ,
    processing_finished_at  TIMESTAMPTZ,
    processing_duration_ms  INTEGER,

    -- Hata bilgileri
    last_error_code         VARCHAR(64),
    last_error_message      TEXT,

    -- Bildirim
    notify_emails           TEXT,
    notify_sent             BOOLEAN NOT NULL DEFAULT FALSE,
    notify_sent_at          TIMESTAMPTZ,
    notify_to_list          TEXT
) PARTITION BY RANGE (created_at);


ilk partition elle oluşturulu sonra job oluşturacak. her ayın son ünü 23.55 de çalışan job bir sonraki ayın partitionını oluşturacak
CREATE TABLE letter_request_2025_08 PARTITION OF letter_request
FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

CREATE INDEX idx_letter_request_2025_08_status_next
    ON letter_request_2025_08 (status_id, next_attempt_at);
	
	
	
	created_at üzerinden RANGE partition yapıldığı için Spring Boot job’unda gelecek ayın ilk günü → sonraki ayın ilk günü aralığında partisyon oluşturuyoruz.

Lookup tablolar (ref_letter_request_type, ref_letter_scope, ref_letter_status) SMALLINT PK olarak tanımlı.

(status_id, next_attempt_at) index’i her yeni partisyona eklenmeli (job bunu otomatik yapacak).

job--kodu----------
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PartitionService {

    private final JdbcTemplate jdbcTemplate;

    /**
     * Gelecek ay için RANGE partition oluşturur.
     * @param baseTable    Ana tablo ismi (ör: letter_request)
     * @param column       Partition RANGE sütunu (ör: created_at)
     * @param indexColumns Bu partisyona eklenecek index kolonları
     */
    public void createNextMonthRangePartition(String baseTable, String column, List<String> indexColumns) {
        LocalDate startDate = LocalDate.now().withDayOfMonth(1).plusMonths(1);
        LocalDate endDate = startDate.plusMonths(1);

        String partitionName = String.format("%s_%s",
                baseTable, startDate.format(DateTimeFormatter.ofPattern("yyyy_MM")));

        // Partisyon var mı kontrol et
        String checkSql = """
            SELECT EXISTS (
                SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind = 'r'
                  AND n.nspname = 'public'
                  AND c.relname = ?
            )
            """;

        Boolean exists = jdbcTemplate.queryForObject(checkSql, Boolean.class, partitionName);

        if (Boolean.FALSE.equals(exists)) {
            // CREATE TABLE PARTITION
            String createSql = String.format("""
                CREATE TABLE %s PARTITION OF %s
                FOR VALUES FROM ('%s') TO ('%s');
                """, partitionName, baseTable, startDate, endDate);
            jdbcTemplate.execute(createSql);

            // Index ekle
            if (indexColumns != null && !indexColumns.isEmpty()) {
                for (String col : indexColumns) {
                    String indexSql = String.format("""
                        CREATE INDEX ON %s (%s);
                        """, partitionName, col);
                    jdbcTemplate.execute(indexSql);
                }
            }

            System.out.printf("Partition %s created for %s - %s%n", partitionName, startDate, endDate);
        } else {
            System.out.printf("Partition %s already exists.%n", partitionName);
        }
    }
}


import lombok.RequiredArgsConstructor;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PartitionScheduler {

    private final PartitionService partitionService;

    // Her ayın son günü saat 23:55'te çalışır
    @Scheduled(cron = "0 55 23 L * *")
    @SchedulerLock(
        name = "createNextMonthPartitions",
        lockAtLeastFor = "PT1M", // en az 1 dakika kilit
        lockAtMostFor = "PT10M" // en fazla 10 dakika kilit
    )
    public void createNextMonthPartitions() {
        // letter_request → created_at RANGE partition
        partitionService.createNextMonthRangePartition(
                "letter_request",
                "created_at",
                List.of("status_id, next_attempt_at")
        );

        // letter_attempt → started_at RANGE partition
        partitionService.createNextMonthRangePartition(
                "letter_attempt",
                "started_at",
                List.of("request_id", "item_id", "started_at")
        );

        // letter_notification_log → sent_at RANGE partition
        partitionService.createNextMonthRangePartition(
                "letter_notification_log",
                "sent_at",
                List.of("request_id", "sent_at")
        );
    }
}




---------------------------------

CREATE TABLE letter_item (
    id                BIGSERIAL PRIMARY KEY,
    request_id        UUID NOT NULL REFERENCES letter_request(id) ON DELETE CASCADE,
    receiver_key      VARCHAR(64) NOT NULL,
    payload_ref       VARCHAR(200),
    status_id         SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    attempt_count     SMALLINT NOT NULL DEFAULT 0,
    last_error_code   VARCHAR(64),
    last_error_message TEXT,
    sent_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY HASH (request_id);


CREATE TABLE letter_attempt (
    id              BIGSERIAL PRIMARY KEY,
    request_id      UUID NOT NULL REFERENCES letter_request(id) ON DELETE CASCADE,
    item_id         BIGINT REFERENCES letter_item(id) ON DELETE CASCADE,
    attempt_no      SMALLINT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    duration_ms     INTEGER,
    result          VARCHAR(20) NOT NULL, -- SUCCESS / FAIL
    error_code      VARCHAR(64),
    error_message   TEXT
) PARTITION BY RANGE (started_at);


CREATE TABLE letter_notification_log (
    id           BIGSERIAL PRIMARY KEY,
    request_id   UUID REFERENCES letter_request(id) ON DELETE CASCADE,
    to_emails    TEXT NOT NULL,
    subject      TEXT,
    sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider_id  VARCHAR(100),
    status       VARCHAR(20)
) PARTITION BY RANGE (sent_at);




------------------------------------ tek script-------------

-- ========================================
-- 1) Lookup Tablolar
-- ========================================
CREATE TABLE ref_letter_request_type (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
INSERT INTO ref_letter_request_type (id, name) VALUES
(1, 'ODEME'),
(2, 'HAKEDIS_DEVIR'),
(3, 'DAVET');

CREATE TABLE ref_letter_scope (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
INSERT INTO ref_letter_scope (id, name) VALUES
(1, 'BULK'),
(2, 'SINGLE');

CREATE TABLE ref_letter_status (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);
INSERT INTO ref_letter_status (id, name) VALUES
(1, 'PENDING'),
(2, 'VALIDATION_FAIL'),
(3, 'READY'),
(4, 'PROCESSING'),
(5, 'PARTIAL_SENT'),
(6, 'SENT'),
(7, 'FAILED'),
(8, 'CANCELLED');

-- ========================================
-- 2) letter_request (RANGE partition)
-- ========================================
CREATE TABLE letter_request (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type_id         SMALLINT NOT NULL REFERENCES ref_letter_request_type(id),
    scope_id                SMALLINT NOT NULL REFERENCES ref_letter_scope(id),
    scope_value             VARCHAR(20),
    first_payment_date      DATE NOT NULL,
    last_payment_date       DATE NOT NULL,
    tahakkuk_turu           VARCHAR(50),
    belge_no                VARCHAR(50),
    yil                     INTEGER,
    karar_no_adi            VARCHAR(200),
    firma_vkn               VARCHAR(20),
    uretici_tckn            VARCHAR(20),
    ihracatci_unvan         VARCHAR(250),
    mektup_tipi_ui          VARCHAR(100),
    status_id               SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    created_by              VARCHAR(64) NOT NULL,
    branch_id               VARCHAR(32) NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updater                 VARCHAR(64),
    attempt_count           SMALLINT NOT NULL DEFAULT 0,
    last_attempt_at         TIMESTAMPTZ,
    next_attempt_at         TIMESTAMPTZ,
    processing_started_at   TIMESTAMPTZ,
    processing_finished_at  TIMESTAMPTZ,
    processing_duration_ms  INTEGER,
    last_error_code         VARCHAR(64),
    last_error_message      TEXT,
    notify_emails           TEXT,
    notify_sent             BOOLEAN NOT NULL DEFAULT FALSE,
    notify_sent_at          TIMESTAMPTZ,
    notify_to_list          TEXT
) PARTITION BY RANGE (created_at);

-- Örnek ilk partisyon (bu ay)
CREATE TABLE letter_request_2025_08 PARTITION OF letter_request
FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE INDEX idx_letter_request_2025_08_status_next
    ON letter_request_2025_08 (status_id, next_attempt_at);

-- ========================================
-- 3) letter_item (HASH partition)
-- ========================================
CREATE TABLE letter_item (
    id                BIGSERIAL PRIMARY KEY,
    request_id        UUID NOT NULL REFERENCES letter_request(id) ON DELETE CASCADE,
    receiver_key      VARCHAR(64) NOT NULL,
    payload_ref       VARCHAR(200),
    status_id         SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    attempt_count     SMALLINT NOT NULL DEFAULT 0,
    last_error_code   VARCHAR(64),
    last_error_message TEXT,
    sent_at           TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
) PARTITION BY HASH (request_id);

-- 8 HASH partition
DO $$
BEGIN
    FOR i IN 0..7 LOOP
        EXECUTE format(
            'CREATE TABLE letter_item_p%s PARTITION OF letter_item
             FOR VALUES WITH (MODULUS 8, REMAINDER %s);', i, i
        );
        EXECUTE format(
            'CREATE INDEX idx_letter_item_p%s_req_status
             ON letter_item_p%s (request_id, status_id);', i, i
        );
    END LOOP;
END$$;

-- ========================================
-- 4) letter_attempt (RANGE partition)
-- ========================================
CREATE TABLE letter_attempt (
    id              BIGSERIAL PRIMARY KEY,
    request_id      UUID NOT NULL REFERENCES letter_request(id) ON DELETE CASCADE,
    item_id         BIGINT REFERENCES letter_item(id) ON DELETE CASCADE,
    attempt_no      SMALLINT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    duration_ms     INTEGER,
    result          VARCHAR(20) NOT NULL, -- SUCCESS / FAIL
    error_code      VARCHAR(64),
    error_message   TEXT
) PARTITION BY RANGE (started_at);

-- Örnek ilk partisyon (bu ay)
CREATE TABLE letter_attempt_2025_08 PARTITION OF letter_attempt
FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE INDEX idx_letter_attempt_2025_08_req ON letter_attempt_2025_08 (request_id);
CREATE INDEX idx_letter_attempt_2025_08_item ON letter_attempt_2025_08 (item_id);
CREATE INDEX idx_letter_attempt_2025_08_start ON letter_attempt_2025_08 (started_at);

-- ========================================
-- 5) letter_notification_log (RANGE partition)
-- ========================================
CREATE TABLE letter_notification_log (
    id           BIGSERIAL PRIMARY KEY,
    request_id   UUID REFERENCES letter_request(id) ON DELETE CASCADE,
    to_emails    TEXT NOT NULL,
    subject      TEXT,
    sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider_id  VARCHAR(100),
    status       VARCHAR(20)
) PARTITION BY RANGE (sent_at);

-- Örnek ilk partisyon (bu ay)
CREATE TABLE letter_notification_log_2025_08 PARTITION OF letter_notification_log
FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE INDEX idx_letter_notification_log_2025_08_req ON letter_notification_log_2025_08 (request_id);
CREATE INDEX idx_letter_notification_log_2025_08_sent ON letter_notification_log_2025_08 (sent_at);


----------------------h2

-- =========================
-- Lookup Tables
-- =========================
CREATE TABLE IF NOT EXISTS ref_letter_request_type (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ref_letter_scope (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ref_letter_status (
    id SMALLINT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- =========================
-- Main Tables
-- =========================
CREATE TABLE IF NOT EXISTS letter_request (
    id UUID PRIMARY KEY,
    request_type_id SMALLINT NOT NULL REFERENCES ref_letter_request_type(id),
    scope_id SMALLINT NOT NULL REFERENCES ref_letter_scope(id),
    scope_value VARCHAR(20),
    first_payment_date DATE NOT NULL,
    last_payment_date DATE NOT NULL,
    tahakkuk_turu VARCHAR(50),
    belge_no VARCHAR(50),
    yil INTEGER,
    karar_no_adi VARCHAR(200),
    firma_vkn VARCHAR(20),
    uretici_tckn VARCHAR(20),
    ihracatci_unvan VARCHAR(250),
    mektup_tipi_ui VARCHAR(100),
    status_id SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    created_by VARCHAR(64) NOT NULL,
    branch_id VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    updater VARCHAR(64),
    attempt_count SMALLINT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP,
    next_attempt_at TIMESTAMP,
    processing_started_at TIMESTAMP,
    processing_finished_at TIMESTAMP,
    processing_duration_ms INTEGER,
    last_error_code VARCHAR(64),
    last_error_message TEXT,
    notify_emails TEXT,
    notify_sent BOOLEAN NOT NULL DEFAULT FALSE,
    notify_sent_at TIMESTAMP,
    notify_to_list TEXT
);

CREATE INDEX IF NOT EXISTS idx_letter_request_status_next_attempt 
    ON letter_request(status_id, next_attempt_at);

-- =========================
-- Letter Attempt Table
-- =========================
CREATE TABLE IF NOT EXISTS letter_attempt (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL,
    item_id UUID,
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    status_id SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    error_code VARCHAR(64),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_letter_attempt_req_item_start 
    ON letter_attempt(request_id, item_id, started_at);

-- =========================
-- Letter Notification Log
-- =========================
CREATE TABLE IF NOT EXISTS letter_notification_log (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL,
    sent_at TIMESTAMP NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    status_id SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_letter_notification_log_req_sent 
    ON letter_notification_log(request_id, sent_at);

-- =========================
-- Letter Item Table (Hash Partition Simülasyonu Yok)
-- =========================
CREATE TABLE IF NOT EXISTS letter_item (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL,
    content TEXT,
    status_id SMALLINT NOT NULL REFERENCES ref_letter_status(id),
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_letter_item_status 
    ON letter_item(status_id);

-- =========================
-- Seed Data (Optional)
-- =========================
INSERT INTO ref_letter_request_type (id, name) VALUES
(1, 'ODEME'),
(2, 'HAKEDIS_DEVIR'),
(3, 'DAVET')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO ref_letter_scope (id, name) VALUES
(1, 'BULK'),
(2, 'SINGLE')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO ref_letter_status (id, name) VALUES
(1, 'PENDING'),
(2, 'VALIDATION_FAIL'),
(3, 'READY'),
(4, 'PROCESSING'),
(5, 'PARTIAL_SENT'),
(6, 'SENT'),
(7, 'FAILED'),
(8, 'CANCELLED')
ON DUPLICATE KEY UPDATE name = VALUES(name);


spring.datasource.url=jdbc:h2:mem:testdb;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=
spring.h2.console.enabled=true

spring.sql.init.mode=always
spring.sql.init.schema-locations=classpath:schema-h2.sql
spring.jpa.hibernate.ddl-auto=none




-- ref_letter_request_type
MERGE INTO ref_letter_request_type (id, name) KEY(id) VALUES (1, 'ODEME');
MERGE INTO ref_letter_request_type (id, name) KEY(id) VALUES (2, 'HAKEDIS_DEVIR');
MERGE INTO ref_letter_request_type (id, name) KEY(id) VALUES (3, 'DAVET');

-- ref_letter_scope
MERGE INTO ref_letter_scope (id, name) KEY(id) VALUES (1, 'BULK');
MERGE INTO ref_letter_scope (id, name) KEY(id) VALUES (2, 'SINGLE');

-- ref_letter_status
MERGE INTO ref_letter_status (id, name) KEY(id) VALUES (1, 'PENDING');
MERGE INTO ref_letter_status (id, name) KEY(id) VALUES (2, 'VALIDATION_FAIL');
MERGE INTO ref_letter_status (id, name) KEY(id) VALUES (3, 'READY');
MERGE INTO ref_letter_status (id, name) KEY(id) VALUES (4, 'PROCESSING');
MERGE INTO ref_letter_status (id, name) KEY(id) VALUES (5, 'PARTIAL_SENT');
MERGE INTO ref_letter_status (id, name) KEY(id) VALUES (6, 'SENT');
MERGE INTO ref_letter_status (id, name) KEY(id) VALUES (7, 'FAILED');
MERGE INTO ref_letter_status (id, name) KEY(id) VALUES (8, 'CANCELLED');




---------------koddd




@RequestMapping(value = "/epostaGonder", method = RequestMethod.POST)
    @ApiOperation(value = "/epostaGonder", httpMethod = "POST", notes = "Kep adresi olan ihracatçılara davet,hakediş devir ve ödeme mektuplarını email olarak gönderir")
    public ApiServiceResponse<Void> mektupEmailGonder(@RequestParam(required = false) KararTipiEnum belgeTip,
                                                      @RequestParam(required = false) Integer belgeNo,
                                                      @RequestParam(required = false) Integer belgeYil,
                                                      @RequestParam(required = false) String kararNo,
                                                      @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate ilkOdemeTarih,
                                                      @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate sonOdemeTarih,
                                                      @RequestParam(required = false) String vkn,
                                                      @RequestParam(required = false) String tckn,
                                                      @RequestParam MektupTipEnum mektupTip) {
        ApiServiceResponse<Void> result;
        try {

            mektupService.sendIhracatciMektupMailRouter(belgeTip, belgeNo, belgeYil, kararNo, ilkOdemeTarih,sonOdemeTarih, vkn, tckn, mektupTip);

            logger.info("epostaGonder", "Eposta gönderme işlemi başarıyla başlatıldı.");
            result = new ApiServiceResponse<>("Eposta gönderme işlemi başarıyla başlatıldı...", HttpStatus.OK);
        } catch (Exception ex) {
            logger.error("epostaGonder", "hata alindi : ", ex);
            result = new ApiServiceResponse<>(HttpStatus.INTERNAL_SERVER_ERROR, HttpStatus.INTERNAL_SERVER_ERROR.getReasonPhrase(), "", ex.getMessage());
        }
        return result;
    }


-----

    void sendIhracatciMektupMailRouter(KararTipiEnum belgeTip, Integer belgeNo, Integer belgeYil, String kararNo, LocalDate ilkOdemeTarihi,LocalDate sonOdemeTarihi,  String vkn, String tckn, MektupTipEnum mektupTip) throws Exception;

---------


 @Override
    public void sendIhracatciMektupMailRouter(KararTipiEnum belgeTip, Integer belgeNo, Integer belgeYil, String kararNo, LocalDate ilkOdemeTarihi,LocalDate sonOdemeTarihi, String vkn, String tckn, MektupTipEnum mektupTip) throws Exception {
        this.parametreKontrolleriYap(belgeTip, belgeNo, belgeYil,  ilkOdemeTarihi, sonOdemeTarihi, mektupTip,vkn,tckn);
        switch (mektupTip) {
            case ODEME_MEKTUPLARI:
                List<String> subeIdList = provizyonIslemleriService.getSubeIdList();
                if (StringUtils.isNotEmpty(kararNo)) {
                    this.nakitKontrolYap(kararNo);
                }
                ortakMektupIslemlerAsyncService.odemeMektupGonderIslemBaslatAsync(belgeTip, belgeYil, belgeNo, kararNo, ilkOdemeTarihi,sonOdemeTarihi, vkn, tckn, subeIdList);
                break;
            case IHRACATCI_DAVET_MEKTUPLARI:
                if (StringUtils.isNotEmpty(kararNo)) {
                    tarimMahsupKontrolYap(kararNo);
                }

                this.kepAdresiOlanIhracatcilaraDavetMektuplariGonder(belgeTip, belgeYil, belgeNo, kararNo, ilkOdemeTarihi,sonOdemeTarihi, vkn, tckn);
                break;
            case HAKEDIS_DEVIR_MEKTUPLARI:
                this.kepAdresiOlanIhracatcilaraHakedisDevirMektuplariGonder(ilkOdemeTarihi,sonOdemeTarihi);
                break;
            default:
                throw new GecersizVeriException("Mektup tipi boş olamaz.");
        }
    }

  @Async
    public void odemeMektupGonderIslemBaslatAsync(KararTipiEnum belgeTip, Integer belgeNo, Integer belgeYil,
                                                  String kararNo, LocalDate ilkOdemeTarihi, LocalDate sonOdemeTarihi,
                                                  String vkn, String tckn, List<String> subeIdList){
            try{
                Date odemeTarihi = Date.from(ilkOdemeTarihi.atStartOfDay(ZoneId.systemDefault()).toInstant());
                Date milatTarihi = OrtakMektupIslemlerAsyncServiceImpl.SDF_TARIH_DD_MM_YYYY.parse(milatTarihiStr);
                if (odemeTarihi.after(milatTarihi)) {
                    mektupService.mailAdresiOlanIhracatcilaraOdemeMektuplariGonder(belgeTip, belgeYil, belgeNo, kararNo, ilkOdemeTarihi,sonOdemeTarihi, vkn, tckn,subeIdList);
                } else {
                    mektupService.mailAdresiOlanIhracatcilaraOdemeMektuplariGonderArsiv(belgeTip, belgeYil, belgeNo, kararNo, ilkOdemeTarihi,sonOdemeTarihi, vkn, tckn,subeIdList);
                }
            }  catch (Exception e) {
                logger.error("odemeMektupGonderIslemBaslatAsync","Ödeme mektup gönderim işlemi sırasında bir hata meydana geldi. {}",e.getMessage());

                String exMessage = String.format("Yapmak istediğiniz -ödeme mektubu gönderme işlemi- sırasında bir hata meydana geldi: %s ", e.getMessage());
                logger.error("odemeMektupGonderIslemBaslatAsync", exMessage);
                logger.error("odemeMektupGonderIslemBaslatAsync", exMessage,e);
                try {
                    asyncEpostaGonder(null, null, null, null, null, exMessage);
                } catch (ValidationException ex) {
                    logger.error("odemeMektupGonderIslemBaslatAsync", "Hatayı eposta ile gönderme işlemi sırasında bir hata meydana geldi : {}", ex.getMessage());
                }
            }
    }

 @Override
    public void mailAdresiOlanIhracatcilaraOdemeMektuplariGonder(KararTipiEnum tip, Integer yil, Integer belgeNo, String kararNo,
                                                                 LocalDate ilkOdemeTarihi,LocalDate sonOdemeTarihi, String vkn, String tckn, List<String> subeIdList) throws Exception,ValidationException {
        logger.info("odeme mektuplarini eposta ile gonder", "Kep bilgisi olan ihracatçılara mail ile mektup gönderme işlemi başladı");

        List<Provizyon> provizyonList = provizyonIslemleriService.listProvizyon(ilkOdemeTarihi, sonOdemeTarihi, tip, belgeNo, yil, kararNo, vkn, tckn,
                null, null,subeIdList);

        if (CollectionUtils.isEmpty(provizyonList)) {

            String exMessage = "Yapmak istediğiniz -ödeme mektubu gönderme işlemi- için ödeme mektubu bulunamamıştır.";
            ortakMektupIslemlerAsyncService.asyncEpostaGonder(null,null,null,null,null,exMessage);
            return;
        }

        Map<Long,List<BorcBilgi>> borcMap = this.borcVerileriniTopluAl(provizyonList);
        if (borcMap == null || borcMap.isEmpty()) {return;}

        provizyonList.parallelStream().forEach(provizyon -> {
                try{
                    islemYapOdemeMektuplari(provizyon,borcMap.get(provizyon.getId()),ilkOdemeTarihi,sonOdemeTarihi,vkn,tckn);
                } catch (Exception e) {
                    String exMessage = String .format("Yapmak istediğiniz -ödeme mektubu gönderme işlemi- sırasında bir hata meydana geldi: %s hatadetay: %s : provizyonId : %s",e,e.getMessage(),provizyon.getId());
                    logger.error("mailAdresiOlanIhracatcilaraOdemeMektuplariGonder",exMessage);
                    logger.error("mailAdresiOlanIhracatcilaraOdemeMektuplariGonder",exMessage,e);
                    try {
                        ortakMektupIslemlerAsyncService.asyncEpostaGonder(null,null,null,null,null,exMessage);
                    } catch (ValidationException ex) {
                        logger.error("mailAdresiOlanIhracatcilaraOdemeMektuplariGonder","Hatayı eposta ile gönderme işlemi sırasında bir hata meydana geldi : {}",ex.getMessage());
                    }
                }
        });
        logger.info("odeme mektuplarini eposta ile gonder", "Kep bilgisi olan ihracatçılara mail ile mektup gönderme işlemi bitti");


    }


@Async
    public void asyncEpostaGonder(Provizyon provizyon,
                                  ProvizyonArsiv provizyonArsiv,
                                  ExportedFile file, String vkn,
                                  String tckn, String exMessage) throws ValidationException {

        logger.info("asyncEpostaGonder","Eposta gönderme işlemi başladı");
        EPostaDTO ePostaDTO = new EPostaDTO();
        ePostaDTO.setFrom(Constants.OGM_BIRIM_MAIL);
        ePostaDTO.setSubject("DFİF Kapsamında Hakediş Ödeme Bilgileri");
        if(exMessage == null){
            String email = Objects.isNull(provizyon) ? provizyonArsiv.getIhracatci().getEmail() :
                    provizyon.getIhracatci().getEmail();
            logger.info("asyncEpostaGonder","Eposta gönderildi-> {}",email);
            ePostaDTO.setTo(List.of(email));
            String kararNo = Objects.isNull(provizyon) ? provizyonArsiv.getKarar().getKararNo() : provizyon.getKarar().getKararNo();
            ePostaDTO.setBody(kararNo + " sayılı karar kapsamında hakettiğiniz tutara ait bilgiler ekteki dokümanda yer almaktadır.");
            if(StringUtils.isNotBlank(vkn) || StringUtils.isNotBlank(tckn)) {
                ePostaDTO.setCc(Collections.singletonList(Constants.OGM_BIRIM_MAIL));
            }
        }else{
            logger.error("asyncEpostaGonder","Hata",exMessage);
            ePostaDTO.setTo(List.of(Constants.OGM_BIRIM_MAIL));
            ePostaDTO.setBody(exMessage);
            ePostaDTO.setCc(List.of(Constants.OGM_BIRIM_MAIL,"yunus.erdogan@tcmb.gov.tr"));
        }
        ePostaDTO.setContentType("text/plain; charset=utf-8");
        ePostaDTO.setApplicationName(APPLICATION_NAME);
        if(file != null){
            Attachment attachment = new Attachment();
            attachment.setName(file.getFileName() + ".pdf");
            attachment.setContent(file.getData());
            List<Attachment> attachmentList = new ArrayList<>();
            attachmentList.add(attachment);
            ePostaDTO.setAttachment(attachmentList);
        }

        mektupService.handleSendEposta(List.of(ePostaDTO), OrtakMektupIslemlerAsyncServiceImpl.STR_ODEME_MEKTUP);
        logger.info("asyncEpostaGonder","Eposta gönderme işlemi bitti");
    }

    @Override
    public void handleSendEposta(List<EPostaDTO> ePostaDTOList, String mektupAd) throws ValidationException {
        Map<String, String> errorMap = epostaGonderimService.sendEposta(ePostaDTOList);
        if (!errorMap.isEmpty()) {
            String mailBodyHtml = this.buildErrorTableHtml(errorMap, mektupAd);
            EPostaDTO hataBildirimMail = new EPostaDTO();
            hataBildirimMail.setFrom(Constants.OGM_BIRIM_MAIL);
            hataBildirimMail.setCc(Collections.singletonList(Constants.OGM_BIRIM_MAIL));
            hataBildirimMail.setSubject("OGMDFIF-E-Posta Gönderiminde Hata Alındı");
            hataBildirimMail.setBody(mailBodyHtml);
            hataBildirimMail.setContentType("text/html; charset=utf-8");
            hataBildirimMail.setTo(Collections.singletonList(Constants.OGM_BIRIM_MAIL));
            hataBildirimMail.setApplicationName(APPLICATION_NAME);
            epostaGonderimService.sendEposta(List.of(hataBildirimMail));
            logger.info("E-Posta hata bildirim maili", "E-Posta gönderiminde bir hata alındı, hata bildirim maili gönderildi");
            throw new ValidationException(String.join("\n", "E-Posta gönderimi sırasında bir hata meydana geldi"));
        }
    }

    private Map<Long,List<BorcBilgi>> borcVerileriniTopluAl(List<Provizyon> provizyonList){
        List<Long> provizyonIds = provizyonList.stream()
                //.filter(provizyon -> provizyon.getIhracatci().getEmail() != null)
                .map(Provizyon::getId)
                .collect(Collectors.toList());
        return borcBilgiService.getBorcBilgiByProvizyonIdListWithoutIslemDurum(provizyonIds)
                .stream()
                .collect(Collectors.groupingBy(borcBilgi -> borcBilgi.getProvizyon().getId()));
    }


  @Transactional(propagation = Propagation.REQUIRES_NEW, rollbackFor = Exception.class)
    public void islemYapOdemeMektuplari(Provizyon provizyon, List<BorcBilgi> borcBilgis, LocalDate ilkOdemeTarihi,LocalDate sonOdemeTarihi,String vkn, String tckn) throws Exception {
        logger.info("islemYapOdemeMektuplari","Odeme Mektuplari işlenmektedir.", provizyon.getId());

        if(!isValidProvizyonAndBorcBilgi(provizyon,borcBilgis)) return;

        List<DocGrupVeri> provizyonVeri = getOdemeMektupDetayByProvizyon(provizyon);
        if (CollectionUtils.isEmpty(provizyonVeri)) {
            return;
        }
        List<DocGrupVeri> veriler = new ArrayList<>(provizyonVeri);
        DocVeri docVeri = new DocVeri();
        docVeri.addGrupVeriAll(veriler);
        PikurDocument pd = pikurIslemService.xmlYukle(ihracatciNakitOdemeMektubuPikurXMLPath);
        ByteArrayOutputStream baos = pikurIslemService.pdfDocOlustur(pd, docVeri, PageSize.A4, OrientationRequested.PORTRAIT);
        ExportedFile file = outputAsPDF(baos, this.handleExportFileName(ilkOdemeTarihi,sonOdemeTarihi, MektupTipEnum.ODEME_MEKTUPLARI));

        ortakMektupIslemlerAsyncService.asyncEpostaGonder(provizyon,null,file,vkn,tckn,null);
        logger.info("islemYapOdemeMektuplari","Odeme Mektuplari işlenmiştir.", provizyon.getId());

    }

  public List<DocGrupVeri> getOdemeMektupDetayByProvizyon(Provizyon provizyon) throws Exception {
        SimpleDateFormat sdfTarih = new SimpleDateFormat("dd/MM/yyyy");
        List<DocGrupVeri> veriler = new ArrayList<>();
        List<DocGrupVeri> borclar = getOdemeMektupBorcBilgileri(provizyon, false);
        if (CollectionUtils.isEmpty(borclar)) {
            return new ArrayList<>();
        }
        DocGrupVeri detayGrup = new DocGrupVeri();
        detayGrup.setGrupAd("DETAY");
        Ihracatci ihracatci = provizyon.getIhracatci();
        detayGrup.addAlanVeri("IHRACATCIADI", ihracatci.getAd());
        String adres1 = ihracatci.getAdres().trim();
        String adres2 = StringUtils.EMPTY;
        String adres3 = StringUtils.EMPTY;
        if (adres1.length() > 50) {
            if (adres1.length() > 100) {
                adres3 = adres1.substring(100);
                adres2 = adres1.substring(50, 100);
            } else {
                adres2 = adres1.substring(50);
                adres1 = adres1.substring(0, 50);
            }
        }

        detayGrup.addAlanVeri("IHRACATCIADRES1", adres1);
        detayGrup.addAlanVeri("IHRACATCIADRES2", adres2);
        detayGrup.addAlanVeri("IHRACATCIADRES3", adres3);
        detayGrup.addAlanVeri("TARIH", sdfTarih.format(new Date()));
        detayGrup.addAlanVeri("KARARNO", provizyon.getKarar().getKararNo());
        String kararAraMetin = "sayılı %s ";
        detayGrup.addAlanVeri("KARARADI", String.format(kararAraMetin, provizyon.getKarar().getAd()));
        detayGrup.addAlanVeri("PROVIZYONTUTAR", provizyon.getTutar());
        detayGrup.addAlanVeri("ODEMETARIH", sdfTarih.format(provizyon.getOdemeTarih()));

        SubeKoduEnum subeKoduEnum = SubeKoduEnum.getById(provizyon.getKarar().getSubeId());
        if (SubeKoduEnum.ANKARA.equals(subeKoduEnum) && !KararTipiEnum.TARIMSAL.equals(KararTipiEnum.getBykod(provizyon.getKarar().getTip()))) {
            subeKoduEnum = SubeKoduEnum.IDARE_MERKEZI;
        }
        detayGrup.addAlanVeri("TCMBSUBEADI", subeKoduEnum.getAdi());

        veriler.add(detayGrup);
        veriler.addAll(borclar);
        return veriler;
    }


    @Transactional
    public List<DocGrupVeri> getOdemeMektupBorcBilgileri(Provizyon provizyon, Boolean sadeceBorcYazdir) throws Exception {

        List<EftBilgiYonetim> eftBilgiYonetimList = eftBilgisiYonetimRepository.getEftBilgiYonetimsByProvizyonId(provizyon.getId());
        if (eftBilgiYonetimList == null || eftBilgiYonetimList.isEmpty()) {
            return new ArrayList<>();
        }
        return  eftBilgiYonetimList.stream()
                .filter(eftBilgiYonetim -> eftBilgiYonetim.getKasTarih() != null && !sadeceBorcYazdir)
                .map(eftBilgiYonetim -> {
                    try {
                        return this.odemeMektupDetayBorcHazirla(eftBilgiYonetim);
                    } catch (Exception e) {
                        System.err.println("OdemeMektupDetayBorcHazirla hatası: " + e.getMessage()); // Hata mesajını logla
                        return null; // veya uygun bir hata değeri döndür
                    }
                }).filter(Objects::nonNull)
                .collect(Collectors.toUnmodifiableList());
    }


private DocGrupVeri odemeMektupDetayBorcHazirla(EftBilgiYonetim eftBilgiYonetim) throws Exception {

        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        LocalDate localDate = LocalDate.parse(eftBilgiYonetim.getKasTarih(), formatter);
        MusteriHesabaOdeme eftMesaj = (MusteriHesabaOdeme) eftClientService.getGunlukKasMesajBySorguNoAndOdemeTarihi(eftBilgiYonetim.getKasSorguNo(), localDate);

        DocGrupVeri detayBorclar = new DocGrupVeri();
        detayBorclar.setGrupAd("BORCBILGILERI");

        if(eftBilgiYonetim.getBorcBilgi() != null && BorcTipEnum.SGK.getKod().equals(eftBilgiYonetim.getBorcBilgi().getBorcTipi())){
            BorcBilgi borcBilgi = eftBilgiYonetim.getBorcBilgi();
            detayBorclar.addAlanVeri("BORCALICISI",borcBilgi.getAliciAdi());
            detayBorclar.addAlanVeri("BORCTUTARI", borcBilgi.getTutar());

        }else{
            detayBorclar.addAlanVeri("BORCALICISI", eftMesaj.getAlAd());
            detayBorclar.addAlanVeri("BORCTUTARI", new BigDecimal(StringUtil.formatVirgulToNokta(eftMesaj.getTtr())));
        }

        String eftBankaKoduAdi = eftMesaj.getAlKK() + "-"
                + bankaSubeService.getBankaForBankaKodu(eftMesaj.getAlKK()).getAd();

        StringBuilder sb = new StringBuilder(eftBankaKoduAdi.trim());
        if (sb.length() > 30) {
            sb.setLength(30);
        }
        detayBorclar.addAlanVeri("EFTBANKAKODUADI", sb.toString());
        detayBorclar.addAlanVeri("EFTHESAP", eftMesaj.getAlHesN());
        detayBorclar.addAlanVeri("EFTTARIHI", eftMesaj.getTrh());
        detayBorclar.addAlanVeri("EFTSORGUNO", eftMesaj.getSN());
        detayBorclar.addAlanVeri("EFTACIKLAMA", eftMesaj.getAcklm());

        return detayBorclar;
    }


    public String handleExportFileName(LocalDate ilkOdemeTarihi, LocalDate sonOdemeTarihi,MektupTipEnum mektupTip) {
        Date odemeTarihi = Date.from(ilkOdemeTarihi.atStartOfDay(ZoneId.systemDefault()).toInstant());
        Date odemeTarihiSon = Date.from(sonOdemeTarihi.atStartOfDay(ZoneId.systemDefault()).toInstant());

        SimpleDateFormat sdfTarih = new SimpleDateFormat("dd/MM/yyyy");
        String odemeTarihStr = sdfTarih.format(odemeTarihi);
        String odemeTarihSonStr = sdfTarih.format(odemeTarihiSon);

        return odemeTarihStr + "_" + odemeTarihSonStr+"_"+mektupTip.getAdi();
    }





@Autowired
    private KararIslemleriService kararIslemleriService;

    @Autowired
    private KullaniciBilgileriService kullaniciBilgileriService;

    @Autowired
    private ProvizyonIslemleriService provizyonIslemleriService;

    @Autowired
    private HakedisIslemleriService hakedisIslemleriService;

    @Autowired
    private BankaSubeService bankaSubeService;

    @Autowired
    private BorcBilgiService borcBilgiService;

    @Autowired
    private EFTClientService eftClientService;

    @Autowired
    private PikurIslemService pikurIslemService;

    @Autowired
    private EpostaGonderimService epostaGonderimService;

    @Autowired
    private MuhasebeClientService muhasebeClientService;

    @Autowired
    private YapilmisOdemeService yapilmisOdemeService;

    @Autowired
    private OrtakMektupIslemlerAsyncServiceImpl ortakMektupIslemlerAsyncService;

    String milatTarihiStr = "20/01/2025";
    private static final SimpleDateFormat SDF_TARIH_DD_MM_YYYY = new SimpleDateFormat("dd/MM/yyyy");
    public static final String APPLICATION_NAME = "ogmdfifse";

    private static final PlatformLogger logger = PlatformLoggerFactory.getLogger(MektupServiceImpl.class);

    private static final String HAKEDIS_DAVET_MEKTUP_BODY = "%s sayılı karar kapsamındaki hak ediş belgesine ilişkin bilgilendirme mektubu ekte yer almaktadır."
            + "Hak ediş belgesinin teslim alınması ve mahsup işlemlerinin yapılabilmesi için Türkiye Cumhuriyet Merkez Bankası %s Şubesine başvurulması gerekmektedir.";


    private static final String HAKEDIS_DEVIR_MEKTUP_BODY = "%s sayılı karar kapsamındaki hak ediş devrine ilişkin bilgilendirme mektubu ekte yer almaktadır."
            + "Hak ediş belgesinin teslim alınması ve mahsup işlemlerinin yapılabilmesi için Türkiye Cumhuriyet Merkez Bankası %s Şubesine başvurulması gerekmektedir.";

    private static final String STR_ODEME_MEKTUP = "Ödeme Mektupları";
    private static final String STR_DAVET_MEKTUP = "Davet Mektupları";
    private static final String STR_HAKEDIS_DEVIR_MEKTUP = "Hakedis Devir Mektupları";
    private static final String STR_DAVET_MEKTUP_BORC = "Ödeme aşamasında yapılan borç sorgusu kapsamında hak edişinizden düşülerek aktarılan tutara ilişkin bilgiler aşağıda yer almaktadır.";



    private static final String ihracatciDevirMektubuPikurXMLPath = "print/IHRACATCIDEVIRMEKTUP.xml";
    private static final String ihracatciHakedisBelgesiPikurXMLPath1 = "print/HAKEDISBELGESI1.xml";
    private static final String genelOdemeListePikurXMLPath = "print/GENELODEMELST.xml";
    private static final String hakedisZimmetListeXMLPath = "print/HAKEDISZIMMETLST.xml";
    private static final String ihracatciDavetMektup = "print/IHRACATCIDAVETMEKTUP.xml";
    private static final String ihracatciNakitOdemeMektubuPikurXMLPath = "print/IHRACATCINAKITODEMEMEKTUP.xml";


 ---------------



 handler


 public interface LetterHandler {
    UUID handleRequest(LetterRequestDto dto, String createdBy, String branchId);
}



@Component
@RequiredArgsConstructor
public class LetterHandlerFactory {

    private final OdemeLetterHandler odemeLetterHandler;
    private final HakedişLetterHandler hakedisLetterHandler;
    private final DavetLetterHandler davetLetterHandler;

    public LetterHandler getHandler(short requestTypeId) {
        switch (requestTypeId) {
            case 1: return odemeLetterHandler;
            case 2: return hakedisLetterHandler;
            case 3: return davetLetterHandler;
            default: throw new IllegalArgumentException("Geçersiz mektup tipi: " + requestTypeId);
        }
    }
}



@Service
@RequiredArgsConstructor
public class OdemeLetterHandler implements LetterHandler {

    private final LetterRequestRepository letterRequestRepo;
    private final ApplicationEventPublisher eventPublisher;

    @Override
    public UUID handleRequest(LetterRequestDto dto, String createdBy, String branchId) {
        validate(dto);

        LetterRequest entity = mapDtoToEntity(dto, createdBy, branchId);
        letterRequestRepo.save(entity);

        // Event publish → asenkron mail için
        eventPublisher.publishEvent(new LetterRequestCreatedEvent(entity.getId()));

        return entity.getId();
    }

    private void validate(LetterRequestDto dto) {
        if (dto.getFirstPaymentDate() == null || dto.getLastPaymentDate() == null) {
            throw new IllegalArgumentException("İlk ve son ödeme tarihi zorunludur.");
        }
        if (dto.getFirstPaymentDate().isAfter(dto.getLastPaymentDate())) {
            throw new IllegalArgumentException("İlk ödeme tarihi son ödeme tarihinden büyük olamaz.");
        }
		
		
		if (ilkOdemeTarih == null || sonOdemeTarih == null) {
            throw new IllegalArgumentException("ilkOdemeTarih ve sonOdemeTarih zorunludur.");
        }
        if (sonOdemeTarih.isBefore(ilkOdemeTarih)) {
            throw new IllegalArgumentException("sonOdemeTarih, ilkOdemeTarih'ten önce olamaz.");
        }
        if (mektupTip == null) {
            throw new IllegalArgumentException("mektupTip zorunludur.");
        }
        if (StringUtils.isNotBlank(vkn) && StringUtils.isNotBlank(tckn)) {
            throw new IllegalArgumentException("VKN ve TCKN aynı anda gönderilemez. Tekil işlemde birini gönderin.");
        }
    }

    private LetterRequest mapDtoToEntity(LetterRequestDto dto, String createdBy, String branchId) {
        LetterRequest entity = new LetterRequest();
        entity.setRequestTypeId(dto.getRequestTypeId());
        if (dto.getScopeValue() != null && !dto.getScopeValue().isBlank()) {
            entity.setScopeId((short) 2); // SINGLE
            entity.setScopeValue(dto.getScopeValue());
        } else {
            entity.setScopeId((short) 1); // BULK
        }
        entity.setFirstPaymentDate(dto.getFirstPaymentDate());
        entity.setLastPaymentDate(dto.getLastPaymentDate());
        entity.setTahakkukTuru(dto.getTahakkukTuru());
        entity.setBelgeNo(dto.getBelgeNo());
        entity.setYil(dto.getYil());
        entity.setKararNoAdi(dto.getKararNoAdi());
        entity.setFirmaVkn(dto.getFirmaVkn());
        entity.setUreticiTckn(dto.getUreticiTckn());
        entity.setIhracatciUnvan(dto.getIhracatciUnvan());
        entity.setMektupTipiUi(dto.getMektupTipiUi());
        entity.setStatusId((short) 3); // READY
        entity.setCreatedBy(createdBy);
        entity.setBranchId(branchId);
        entity.setCreatedAt(OffsetDateTime.now());
        entity.setUpdatedAt(OffsetDateTime.now());
        entity.setNotifyEmails(dto.getNotifyEmails());
        entity.setNotifySent(false);
        return entity;
    }
}


@Service
public class HakedişLetterHandler implements LetterHandler {
    @Override
    public UUID handleRequest(LetterRequestDto dto, String createdBy, String branchId) {
        // Şimdilik boş
        throw new UnsupportedOperationException("Hakediş mektup işlemi henüz uygulanmadı.");
    }
}


@Service
public class DavetLetterHandler implements LetterHandler {
    @Override
    public UUID handleRequest(LetterRequestDto dto, String createdBy, String branchId) {
        // Şimdilik boş
        throw new UnsupportedOperationException("Davet mektup işlemi henüz uygulanmadı.");
    }
}



@Service
@RequiredArgsConstructor
public class LetterRequestService {

    private final LetterHandlerFactory handlerFactory;

    public UUID createLetterRequest(LetterRequestDto dto, String createdBy, String branchId) {
        LetterHandler handler = handlerFactory.getHandler(dto.getRequestTypeId());
        return handler.handleRequest(dto, createdBy, branchId);
    }
}


@Getter
@AllArgsConstructor
public class LetterRequestCreatedEvent {
    private final UUID requestId;
}


@Service
@RequiredArgsConstructor
@Slf4j
public class LetterNotificationEventListener {

    private final LetterRequestRepository letterRequestRepo;
    private final LetterNotificationLogRepository notificationLogRepo;
    private final MailService mailService;

    @Async
    @EventListener
    public void handleLetterRequestCreated(LetterRequestCreatedEvent event) {
        letterRequestRepo.findById(event.getRequestId()).ifPresent(request -> {
            try {
                String body = buildMailBody(request);
                String subject = "Yeni Mektup Talebi Kaydı";
                String recipients = request.getNotifyEmails() != null ?
                        request.getNotifyEmails() :
                        request.getCreatedBy() + "@example.com";

                mailService.sendMail(recipients, subject, body);

                LetterNotificationLog logEntry = new LetterNotificationLog();
                logEntry.setRequest(request);
                logEntry.setToEmails(recipients);
                logEntry.setSubject(subject);
                logEntry.setStatus("SENT");
                notificationLogRepo.save(logEntry);

                request.setNotifySent(true);
                request.setNotifySentAt(OffsetDateTime.now());
                letterRequestRepo.save(request);

            } catch (Exception e) {
                log.error("Mail gönderiminde hata: {}", e.getMessage(), e);
            }
        });
    }

    private String buildMailBody(LetterRequest entity) {
        return String.format(
                "Sayın Yetkili,\n\n" +
                "Aşağıdaki bilgilerle yeni bir mektup talebi kaydedilmiştir:\n" +
                "Talep No: %s\n" +
                "Mektup Tipi ID: %d\n" +
                "Scope: %d (%s)\n" +
                "İlk Ödeme Tarihi: %s\n" +
                "Son Ödeme Tarihi: %s\n" +
                "Talebi Yapan: %s (Şube: %s)\n" +
                "Kayıt Tarihi: %s\n\n" +
                "Bu talep, sistem jobu tarafından işlenecektir.\n\nSaygılarımızla,\nMektup Sistemi",
                entity.getId(),
                entity.getRequestTypeId(),
                entity.getScopeId(),
                entity.getScopeValue() != null ? entity.getScopeValue() : "BULK",
                entity.getFirstPaymentDate(),
                entity.getLastPaymentDate(),
                entity.getCreatedBy(),
                entity.getBranchId(),
                entity.getCreatedAt()
        );
    }
}


@Entity
@Table(name = "letter_notification_log")
@Getter @Setter
public class LetterNotificationLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "request_id")
    private LetterRequest request;

    @Column(name = "to_emails", nullable = false)
    private String toEmails;

    @Column(name = "subject")
    private String subject;

    @Column(name = "sent_at", nullable = false)
    private OffsetDateTime sentAt = OffsetDateTime.now();

    @Column(name = "provider_id")
    private String providerId;

    @Column(name = "status")
    private String status;
}


@Data
public class LetterRequestDto {
    private Short requestTypeId; // 1: ODEME, 2: HAKEDIS, 3: DAVET
    private String scopeValue; // VKN veya TCKN
    private LocalDate firstPaymentDate;
    private LocalDate lastPaymentDate;

    private String tahakkukTuru;
    private String belgeNo;
    private Integer yil;
    private String kararNoAdi;
    private String firmaVkn;
    private String ureticiTckn;
    private String ihracatciUnvan;
    private String mektupTipiUi;

    private String notifyEmails;
}



sad// LetterRequest.java  (DDL’deki alan adlarıyla birebir)
@Entity
@Table(name = "letter_request")
@Getter @Setter
public class LetterRequest {
    @Id
    @GeneratedValue
    private UUID id;

    @Column(name="request_type_id", nullable=false)
    private Short requestTypeId;

    @Column(name="scope_id", nullable=false)
    private Short scopeId;

    @Column(name="scope_value")
    private String scopeValue;

    @Column(name="first_payment_date", nullable=false)
    private LocalDate firstPaymentDate;

    @Column(name="last_payment_date", nullable=false)
    private LocalDate lastPaymentDate;

    @Column(name="tahakkuk_turu")  private String tahakkukTuru;
    @Column(name="belge_no")       private String belgeNo;
    @Column(name="yil")            private Integer yil;
    @Column(name="karar_no_adi")   private String kararNoAdi;
    @Column(name="firma_vkn")      private String firmaVkn;
    @Column(name="uretici_tckn")   private String ureticiTckn;
    @Column(name="ihracatci_unvan") private String ihracatciUnvan;
    @Column(name="mektup_tipi_ui")  private String mektupTipiUi;

    @Column(name="status_id", nullable=false)
    private Short statusId;

    @Column(name="created_by", nullable=false)
    private String createdBy;

    @Column(name="branch_id", nullable=false)
    private String branchId;

    @Column(name="created_at", nullable=false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name="updated_at", nullable=false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @Column(name="updater")       private String updater;
    @Column(name="attempt_count", nullable=false) private Short attemptCount = 0;
    @Column(name="last_attempt_at") private OffsetDateTime lastAttemptAt;
    @Column(name="next_attempt_at") private OffsetDateTime nextAttemptAt;
    @Column(name="processing_started_at")  private OffsetDateTime processingStartedAt;
    @Column(name="processing_finished_at") private OffsetDateTime processingFinishedAt;
    @Column(name="processing_duration_ms") private Integer processingDurationMs;
    @Column(name="last_error_code")        private String lastErrorCode;
    @Column(name="last_error_message")     private String lastErrorMessage;
    @Column(name="notify_emails")          private String notifyEmails;
    @Column(name="notify_sent", nullable=false) private Boolean notifySent = false;
    @Column(name="notify_sent_at")         private OffsetDateTime notifySentAt;
    @Column(name="notify_to_list")         private String notifyToList;
}


public interface LetterRequestRepository extends JpaRepository<LetterRequest, UUID> {
    // enqueue sonrası işlemek için job kullanacak; şimdilik sadece kayıt tarafı lazım.
}



@PostMapping("/epostaGonder")
    @ApiOperation(
        value = "/epostaGonder",
        httpMethod = "POST",
        notes = "Kep adresi olan ihracatçılara davet,hakediş devir ve ödeme mektuplarını email olarak gönderir"
    )
    public ApiServiceResponse mektupEmailGonder(
            @RequestParam(required = false) KararTipiEnum belgeTip,
            @RequestParam(required = false) Integer belgeNo,
            @RequestParam(required = false) Integer belgeYil,
            @RequestParam(required = false) String kararNo,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate ilkOdemeTarih,
            @RequestParam @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate sonOdemeTarih,
            @RequestParam(required = false) String vkn,
            @RequestParam(required = false) String tckn,
            @RequestParam MektupTipEnum mektupTip
    ) {
        // DTO hazırlama
        LetterRequestDto dto = new LetterRequestDto();
        dto.setRequestTypeId(convertMektupTipToRequestTypeId(mektupTip));
        dto.setFirstPaymentDate(ilkOdemeTarih);
        dto.setLastPaymentDate(sonOdemeTarih);
        dto.setTahakkukTuru(belgeTip != null ? belgeTip.name() : null);
        dto.setBelgeNo(belgeNo != null ? belgeNo.toString() : null);
        dto.setYil(belgeYil);
        dto.setKararNoAdi(kararNo);
        dto.setFirmaVkn(vkn);
        dto.setUreticiTckn(tckn);
        dto.setScopeValue(vkn != null ? vkn : tckn);

        // Request kaydetme
        UUID requestId = letterRequestService.createLetterRequest(dto, "system_user", "BR001");

        return ApiServiceResponse.success(
                String.format("Mektup talebi oluşturuldu. ID: %s", requestId)
        );
    }

    private short convertMektupTipToRequestTypeId(MektupTipEnum tip) {
        switch (tip) {
            case ODEME: return 1;
            case HAKEDIS_DEVIR: return 2;
            case DAVET: return 3;
            default: throw new IllegalArgumentException("Geçersiz mektup tipi: " + tip);
        }
    }


---yunus


@Repository
public interface LetterAttemptRepository extends JpaRepository<LetterAttempt, Long> {

    /**
     * Her deneme ayrı log olarak saklanır.
     */
    @Modifying
    @Query(value = """
        INSERT INTO letter_attempt(
            request_id, item_id, attempt_no, 
            started_at, finished_at, duration_ms, 
            result, error_code, error_message
        )
        VALUES (
            :requestId, :itemId, :attemptNo,
            :startedAt, :finishedAt, :durationMs,
            :result, :errorCode, :errorMessage
        )
    """, nativeQuery = true)
    void insertAttempt(@Param("requestId") UUID requestId,
                       @Param("itemId") Long itemId,
                       @Param("attemptNo") short attemptNo,
                       @Param("startedAt") OffsetDateTime startedAt,
                       @Param("finishedAt") OffsetDateTime finishedAt,
                       @Param("durationMs") int durationMs,
                       @Param("result") String result,
                       @Param("errorCode") String errorCode,
                       @Param("errorMessage") String errorMessage);
}






@Repository
public interface LetterItemRepository extends JpaRepository<LetterItem, Long> {

    @Query(value = """
        SELECT * 
          FROM letter_item 
         WHERE request_id = :requestId
    """, nativeQuery = true)
    List<LetterItem> findAllByRequestId(@Param("requestId") UUID requestId);

    /**
     * Aynı item varsa eklemeyecek.
     */
    @Modifying
    @Query(value = """
        INSERT INTO letter_item(request_id, receiver_key, payload_ref, status_id, attempt_count, created_at, updated_at)
        VALUES (:requestId, :receiverKey, :payloadRef, 1, 0, now(), now())
        ON CONFLICT DO NOTHING
    """, nativeQuery = true)
    void insertIfNotExists(@Param("requestId") UUID requestId,
                           @Param("receiverKey") String receiverKey,
                           @Param("payloadRef") String payloadRef);

    /**
     * Item statüsünü ve hata bilgilerini günceller.
     * status_id = 6 ise sent_at otomatik olarak set edilir.
     */
    @Modifying
    @Query(value = """
        UPDATE letter_item
           SET status_id = :statusId,
               attempt_count = :attemptCount,
               last_error_code = :errorCode,
               last_error_message = :errorMessage,
               sent_at = CASE WHEN :statusId = 6 THEN now() ELSE sent_at END,
               updated_at = now()
         WHERE id = :itemId
    """, nativeQuery = true)
    int updateStatus(@Param("itemId") Long itemId,
                     @Param("statusId") short statusId,
                     @Param("attemptCount") short attemptCount,
                     @Param("errorCode") String errorCode,
                     @Param("errorMessage") String errorMessage);
}
----





@Repository
public interface LetterRequestRepository extends JpaRepository<LetterRequest, UUID> {

    /**
     * READY (3) ve zamanı gelmiş talepleri getirir.
     * LIMIT ile küçük batch’ler halinde çalışır.
     */
    @Query(value = """
        SELECT r.* 
          FROM letter_request r
         WHERE r.status_id = 3
           AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= now())
         ORDER BY r.created_at ASC
         LIMIT :limit
    """, nativeQuery = true)
    List<LetterRequest> findReadyDue(@Param("limit") int limit);

    /**
     * Talebi PROCESSING (4) statüsüne çeker.
     * Aynı anda başka bir job claim etmesin diye status_id in (3,4) şartı var.
     */
    @Modifying
    @Query(value = """
        UPDATE letter_request
           SET status_id = 4,
               processing_started_at = now(),
               updated_at = now(),
               attempt_count = attempt_count + 1,
               last_attempt_at = now()
         WHERE id = :id
           AND status_id IN (3,4)
    """, nativeQuery = true)
    int markProcessing(@Param("id") UUID id);

    /**
     * Talebi işlem sonunda bitirir. Status_id ve hata bilgilerini günceller.
     */
    @Modifying
    @Query(value = """
        UPDATE letter_request
           SET status_id = :statusId,
               processing_finished_at = now(),
               processing_duration_ms = EXTRACT(EPOCH FROM (now() - COALESCE(processing_started_at, now()))) * 1000,
               updated_at = now(),
               last_error_code = :errorCode,
               last_error_message = :errorMessage
         WHERE id = :id
    """, nativeQuery = true)
    int finishRequest(@Param("id") UUID id,
                      @Param("statusId") short statusId,
                      @Param("errorCode") String errorCode,
                      @Param("errorMessage") String errorMessage);

    /**
     * İlgili request’te gönderilmiş item sayısı
     */
    @Query(value = """
        SELECT COUNT(*) 
          FROM letter_item i 
         WHERE i.request_id = :requestId 
           AND i.status_id = 6
    """, nativeQuery = true)
    long countSent(@Param("requestId") UUID requestId);

    /**
     * İlgili request’te başarısız item sayısı
     */
    @Query(value = """
        SELECT COUNT(*) 
          FROM letter_item i 
         WHERE i.request_id = :requestId 
           AND i.status_id = 7
    """, nativeQuery = true)
    long countFailed(@Param("requestId") UUID requestId);

    /**
     * İlgili request’teki toplam item sayısı
     */
    @Query(value = """
        SELECT COUNT(*) 
          FROM letter_item i 
         WHERE i.request_id = :requestId
    """, nativeQuery = true)
    long countAllItems(@Param("requestId") UUID requestId);
}


-------------

public interface RecipientProvider {
    /**
     * Request'e göre receiver_key listesi döner.
     * SINGLE ise scope_value tek key’dir.
     * BULK ise arka sistemden sorgu ile N key üretmelidir.
     */
    List<String> resolveReceiverKeys(LetterRequest request);
}

@Service
public class DefaultRecipientProvider implements RecipientProvider {
    @Override
    public List<String> resolveReceiverKeys(LetterRequest r) {
        // SINGLE
        if (r.getScopeId() != null && r.getScopeId() == 2 && r.getScopeValue() != null) {
            return List.of(r.getScopeValue());
        }
        // BULK – burada gerçek sisteminden (provizyon vb.) filtre ile al
        // Şimdilik demo için sahte 3 kayıt:
        return List.of("VKN_1111111111", "VKN_2222222222", "VKN_3333333333");
    }
}






public interface ItemSender {
    /** Tek bir receiver için mektup gönderir. Başarısızlıkta Exception fırlatır. */
    void sendOne(LetterRequest req, String receiverKey) throws Exception;
}

@Service
public class OdemeItemSender implements ItemSender {
    @Override
    public void sendOne(LetterRequest req, String receiverKey) throws Exception {
        // Burada senin ödeme mektubu üretim + pdf + mail gönderim akışın çalışır.
        // Örnek demo:
        if (receiverKey.contains("2222")) {
            throw new RuntimeException("SMTP_421 Temporary failure"); // demo fail
        }
        // başarılı → hiçbir şey yapma (exception yok = success)
    }
}

@Service
public class UnsupportedItemSender implements ItemSender {
    @Override public void sendOne(LetterRequest req, String receiverKey) throws Exception {
        throw new UnsupportedOperationException("UNSUPPORTED_REQUEST_TYPE");
    }
}

@Service
public class ItemSenderFactory {
    private final OdemeItemSender odeme;
    private final UnsupportedItemSender unsupported;

    public ItemSenderFactory(OdemeItemSender odeme, UnsupportedItemSender unsupported) {
        this.odeme = odeme;
        this.unsupported = unsupported;
    }
    public ItemSender forType(short requestTypeId) {
        if (requestTypeId == 1) return odeme; // ODEME
        // 2/3 henüz boş ise unsupported
        return unsupported;
    }
}


------------
@Service
@RequiredArgsConstructor
@Slf4j
public class LetterProcessingJob {

    private static final int PICK_LIMIT = 20;   // her taramada max kaç request
    private static final int MAX_RETRY  = 3;    // item bazında

    private final LetterRequestRepository requestRepo;
    private final LetterItemRepository itemRepo;
    private final LetterAttemptRepository attemptRepo;
    private final RecipientProvider recipientProvider;
    private final ItemSenderFactory itemSenderFactory;

    @Scheduled(fixedDelayString = "PT1M") // her 1 dakikada bir
    @SchedulerLock(name = "letterProcessingJob", lockAtLeastFor = "PT20S", lockAtMostFor = "PT5M")
    public void runBatch() {
        try {
            List<LetterRequest> candidates = requestRepo.findReadyDue(PICK_LIMIT);
            if (candidates.isEmpty()) {
                log.debug("No READY requests to process.");
                return;
            }
            log.info("Picked {} request(s) to process", candidates.size());

            for (LetterRequest r : candidates) {
                processOneRequestSafe(r); // hiçbir request diğerini bloklamasın
            }
        } catch (Exception e) {
            log.error("Batch error", e);
        }
    }

    private void processOneRequestSafe(LetterRequest r) {
        try {
            // PROCESSING'e çek (claim). idempotent: 0 dönerse başka worker almış demektir.
            int updated = requestRepo.markProcessing(r.getId());
            if (updated == 0) {
                log.info("Request {} already claimed by another worker.", r.getId());
                return;
            }

            long start = System.currentTimeMillis();

            // 1) item üret (varsa atla)
            ensureItemsExist(r);

            // 2) item'ları işle (paralel & bağımsız)
            List<LetterItem> items = itemRepo.findAllByRequestId(r.getId());
            ItemSender sender = itemSenderFactory.forType(r.getRequestTypeId());

            items.parallelStream().forEach(item -> {
                // SENT/FAILED olmuş item’ı atla
                if (item.getStatusId() != null && (item.getStatusId() == 6 || item.getStatusId() == 7)) return;
                processOneItemWithRetry(r, item, sender);
            });

            // 3) request final durum
            updateRequestFinalStatus(r.getId(), start);

        } catch (Exception ex) {
            log.error("Request {} fatal error", r.getId(), ex);
            // kritik durumda bile request FAILED'a düşür (idempotent)
            requestRepo.finishRequest(r.getId(), (short)7, "REQUEST_FATAL", safeMsg(ex.getMessage()));
        }
    }

    private void ensureItemsExist(LetterRequest r) {
        List<String> receivers = recipientProvider.resolveReceiverKeys(r);
        if (receivers == null || receivers.isEmpty()) {
            // hiç alıcı yoksa: direkt FAILED
            requestRepo.finishRequest(r.getId(), (short)7, "NO_RECEIVER", "No receiver resolved.");
            throw new IllegalStateException("No receiver resolved for request " + r.getId());
        }
        // idempotent insert
        receivers.forEach(key ->
            itemRepo.insertIfNotExists(r.getId(), key, null)
        );
    }

    private void processOneItemWithRetry(LetterRequest req, LetterItem item, ItemSender sender) {
        short currentAttempts = item.getAttemptCount() == null ? 0 : item.getAttemptCount();

        for (short attemptNo = (short)(currentAttempts + 1); attemptNo <= MAX_RETRY; attemptNo++) {
            OffsetDateTime started = OffsetDateTime.now();
            long t0 = System.currentTimeMillis();
            String errCode = null; String errMsg = null; String result = "SUCCESS";

            try {
                sender.sendOne(req, item.getReceiverKey()); // Exception → FAIL
            } catch (UnsupportedOperationException ue) {
                result = "FAIL";
                errCode = "UNSUPPORTED";
                errMsg  = safeMsg(ue.getMessage());
            } catch (Exception e) {
                result = "FAIL";
                errCode = e.getClass().getSimpleName();
                errMsg  = safeMsg(e.getMessage());
            }

            int duration = (int)(System.currentTimeMillis() - t0);
            attemptRepo.insertAttempt(req.getId(), item.getId(), attemptNo, started, OffsetDateTime.now(), duration, result, errCode, errMsg);

            if ("SUCCESS".equals(result)) {
                // Item SENT
                itemRepo.updateStatus(item.getId(), (short)6, attemptNo, null, null);
                return;
            } else {
                // Deneme başarısız → attempt sayısını güncelle
                boolean lastTry = (attemptNo == MAX_RETRY);
                if (lastTry) {
                    itemRepo.updateStatus(item.getId(), (short)7, attemptNo, errCode, errMsg); // FAILED
                    return;
                } else {
                    // araya küçük bekleme istersen burada sleep koyabilirsin
                    itemRepo.updateStatus(item.getId(), item.getStatusId() == null ? (short)1 : item.getStatusId(), attemptNo, errCode, errMsg);
                }
            }
        }
    }

    private void updateRequestFinalStatus(UUID requestId, long startMillis) {
        long total = requestRepo.countAllItems(requestId);
        long sent  = requestRepo.countSent(requestId);
        long fail  = requestRepo.countFailed(requestId);

        short status;
        String code = null, msg = null;

        if (total == 0) {
            status = 7; code = "NO_ITEMS"; msg = "No items were generated.";
        } else if (sent == total) {
            status = 6; // SENT
        } else if (sent > 0 && fail > 0) {
            status = 5; code = "PARTIAL"; msg = String.format("%d/%d items failed", fail, total);
        } else {
            status = 7; code = "ALL_FAILED"; msg = String.format("All %d items failed", total);
        }

        requestRepo.finishRequest(requestId, status, code, msg);
        log.info("Request {} finished in {} ms → status={}, sent={}/{}", requestId,
                (System.currentTimeMillis() - startMillis), status, sent, total);
    }

    private String safeMsg(String s) {
        if (s == null) return null;
        return s.length() > 4000 ? s.substring(0, 4000) : s;
    }
}


@Entity
@Table(name = "letter_attempt")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LetterAttempt {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "request_id", nullable = false)
    private UUID requestId;

    @Column(name = "item_id")
    private Long itemId;

    @Column(name = "attempt_no", nullable = false)
    private Short attemptNo;

    @Column(name = "started_at", nullable = false)
    private OffsetDateTime startedAt;

    @Column(name = "finished_at")
    private OffsetDateTime finishedAt;

    @Column(name = "duration_ms")
    private Integer durationMs;

    /**
     * SUCCESS / FAIL
     */
    @Column(name = "result", nullable = false, length = 20)
    private String result;

    @Column(name = "error_code", length = 64)
    private String errorCode;

    @Column(name = "error_message")
    private String errorMessage;
}

-- Ana letter_attempt tablosu (partition root)
CREATE TABLE letter_attempt (
    id              BIGSERIAL PRIMARY KEY,
    request_id      UUID NOT NULL REFERENCES letter_request(id) ON DELETE CASCADE,
    item_id         BIGINT REFERENCES letter_item(id) ON DELETE CASCADE,
    attempt_no      SMALLINT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ,
    duration_ms     INTEGER,
    result          VARCHAR(20) NOT NULL, -- SUCCESS / FAIL
    error_code      VARCHAR(64),
    error_message   TEXT
);

-- Performans için indexler
CREATE INDEX idx_letter_attempt_req ON letter_attempt (request_id);
CREATE INDEX idx_letter_attempt_item ON letter_attempt (item_id);
CREATE INDEX idx_letter_attempt_start ON letter_attempt (started_at);

