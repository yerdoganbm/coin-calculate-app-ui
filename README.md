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

