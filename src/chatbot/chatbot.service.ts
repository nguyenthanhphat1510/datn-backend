import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { GoogleGenAI, Type } from '@google/genai';
import { ChatMessageDto } from './dto/chat.dto';
import { Disease } from '../diseases/entities/disease.entity';
import { Product } from '../products/entities/product.entity';
import {
  EmbeddingService,
  EMBEDDING_DIM,
} from '../common/embedding/embedding.service';
import { TechniquesService } from '../techniques/techniques.service';
import { DiseasePredictionService } from '../diseases/disease-prediction.service';

// Tên Vector Search Index tạo trên Atlas cho collection diseases (xem hướng dẫn).
const DISEASE_VECTOR_INDEX = 'disease_vector_index';

// Tên Vector Search Index trên Atlas cho collection products (nhánh san_pham).
const PRODUCT_VECTOR_INDEX = 'product_vector_index';

// Ngưỡng cosine SÀN để loại câu lạc đề. Đo thực tế: câu không liên quan ("có bán
// máy bay không") cho điểm nền ~0.77; câu hỏi SP hợp lệ cho SP đúng ~0.85-0.89.
// Chọn 0.8 để cắt vùng lạc đề.
const PRODUCT_MIN_SCORE = 0.8;

// Khoảng cách điểm tối đa so với SP khớp nhất (top). gemini-embedding dồn điểm
// trong dải hẹp nên SP nhiễu (vd phân bón lọt vào câu hỏi trị bệnh) thường thấp
// hơn top một chút — chỉ giữ SP có điểm >= topScore - GAP để loại nhiễu này.
const PRODUCT_SCORE_GAP = 0.04;

// Số sản phẩm tối đa gợi ý cho một câu hỏi (khớp lưới 2 cột ở frontend).
const PRODUCT_LIMIT = 4;

// Ngưỡng cosine tối thiểu để coi là "có khả năng đúng bệnh". Dưới ngưỡng → coi
// như không tìm thấy (tránh vector search luôn trả top-1 kể cả câu lạc đề).
// gemini-embedding-001 cho điểm nền cao (~0.77 cả với câu lạc đề), trong khi câu
// mô tả triệu chứng đúng đạt ~0.88+. Chọn 0.82 để tách hai vùng này.
const VECTOR_MIN_SCORE = 0.82;

// Vùng cosine "trên ngưỡng đến gần như chắc chắn" để ánh xạ ra % trực quan.
// gemini-embedding-001 dồn điểm trong khoảng hẹp nên map [0.82..0.95] → [60..99]%
// để con số phản ánh đúng mức tin cậy thay vì luôn ~85-92%.
const SCORE_CONF_MIN = 0.82;
const SCORE_CONF_MAX = 0.95;

// Ngưỡng cosine SÀN cho nhánh ky_thuat (tìm đoạn tài liệu kỹ thuật). Chunk tài
// liệu dài thường khớp thấp hơn câu triệu chứng ngắn → đặt thấp hơn (0.7) để
// không bỏ sót. Tinh chỉnh sau khi đo score thực tế (xem log vector search).
const TECHNIQUE_MIN_SCORE = 0.7;

// Số đoạn tài liệu tối đa lấy làm context cho Gemini ở nhánh ky_thuat.
const TECHNIQUE_LIMIT = 3;

// Ngưỡng confidence tối thiểu của MODEL ẢNH (0..1) để khẳng định bệnh khi người
// dùng gửi ảnh. Model luôn trả top-1 kể cả ảnh không phải lá lúa, nên dưới ngưỡng
// này ta trả lời "chưa chắc chắn" thay vì khẳng định sai.
const IMAGE_CONF_MIN = 0.5;

const MODEL = 'gemini-3.1-flash-lite';

// 5 nhóm intent mà chatbot phân loại câu hỏi người dùng vào.
export const INTENTS = [
  'ky_thuat',
  'trieu_chung',
  'san_pham',
  'so_sanh',
  'don_hang',
  'khac',
] as const;
export type Intent = (typeof INTENTS)[number];

// Map mỗi intent → câu thông báo debug (bước này các nhánh chưa xử lý thật).
const INTENT_LABEL: Record<Intent, string> = {
  ky_thuat: '[intent=ky_thuat] Nhánh: Kỹ thuật canh tác lúa',
  trieu_chung: '[intent=trieu_chung] Nhánh: Chẩn đoán bệnh qua triệu chứng',
  san_pham: '[intent=san_pham] Nhánh: Tìm sản phẩm',
  so_sanh: '[intent=so_sanh] Nhánh: So sánh / tư vấn chọn sản phẩm',
  don_hang: '[intent=don_hang] Nhánh: Đơn hàng / giỏ hàng',
  khac: '[intent=khac] Nhánh: Chào hỏi / ngoài phạm vi',
};

// Hướng dẫn Gemini phân loại câu hỏi vào đúng 1 trong 6 nhóm.
const CLASSIFY_INSTRUCTION = `Bạn là bộ phân loại ý định (intent) cho chatbot nông nghiệp TP Agri (chuyên về cây lúa).
Nhiệm vụ: đọc cuộc hội thoại và phân loại TIN NHẮN MỚI NHẤT của người dùng vào ĐÚNG MỘT nhóm dưới đây.
Dùng các tin nhắn trước đó làm ngữ cảnh khi tin mới nhất quá ngắn hoặc nối tiếp ý trước (vd "loại nào tốt hơn?", "vậy bón bao nhiêu?").

Sáu nhóm:
- ky_thuat: hỏi CÁCH LÀM / quy trình kỹ thuật canh tác lúa (làm đất, chọn giống, ngâm ủ, gieo sạ, bón phân, tưới/quản lý nước, làm cỏ, phòng trừ sâu bệnh nói chung, thu hoạch, bảo quản, mùa vụ, liều lượng/thời điểm...).
- trieu_chung: người dùng MÔ TẢ dấu hiệu bất thường trên cây lúa và muốn biết ĐÓ LÀ BỆNH GÌ (vd "lá có đốm nâu", "cây bị vàng lá lụi dần", "thân thối nhũn"). Trọng tâm là CHẨN ĐOÁN, chưa hỏi mua.
- san_pham: người dùng muốn TÌM/MUA sản phẩm cụ thể (thuốc, phân bón) — hỏi giá, công dụng, còn hàng, "có loại nào trị...", "tư vấn phân bón".
- so_sanh: người dùng muốn SO SÁNH các sản phẩm với nhau hoặc hỏi NÊN CHỌN cái nào trong số các sản phẩm đã được gợi ý trước đó (vd "so sánh 2 loại này", "loại nào tốt hơn", "nên mua cái nào", "khác nhau chỗ nào"). Trọng tâm là LỰA CHỌN giữa các sản phẩm ĐÃ BIẾT, không phải tìm sản phẩm mới.
- don_hang: hỏi về ĐƠN HÀNG hoặc GIỎ HÀNG của chính người dùng (trạng thái giao, đã mua gì, mã đơn, giỏ hàng).
- khac: chào hỏi, cảm ơn, tạm biệt, xin gặp nhân viên, hoặc câu NGOÀI phạm vi cây lúa / dịch vụ TP Agri.

Quy tắc ưu tiên khi câu CHỒNG nhiều nhóm (xét từ trên xuống, gặp điều kiện đúng trước thì chọn ngay):
1. Nếu hỏi về đơn/giỏ hàng của bản thân → don_hang.
2. Nếu SO SÁNH / hỏi NÊN CHỌN cái nào giữa các sản phẩm (thường nối tiếp sau khi đã gợi ý sản phẩm) → so_sanh.
3. Nếu có ý ĐỊNH MUA hoặc HỎI THUỐC/PHÂN cụ thể (kể cả khi có nhắc tên bệnh, vd "có thuốc nào trị đạo ôn") → san_pham.
4. Nếu chỉ MÔ TẢ triệu chứng để nhờ đoán bệnh, CHƯA hỏi mua → trieu_chung.
5. Nếu hỏi cách làm/quy trình kỹ thuật → ky_thuat.
6. Còn lại → khac.

Phân biệt dễ nhầm:
- "Lúa bị đốm nâu là bệnh gì?" → trieu_chung (nhờ đoán bệnh).
- "Có thuốc nào trị đốm nâu không?" → san_pham (muốn mua thuốc).
- "Trong các loại trên thì nên chọn cái nào?" → so_sanh (chọn giữa SP đã gợi ý).
- "Loại nào tốt hơn?" / "So sánh giúp tôi 2 cái này" → so_sanh.
- "Bón phân cho lúa giai đoạn đẻ nhánh thế nào?" → ky_thuat (hỏi cách làm), KHÔNG phải san_pham dù có chữ "phân".

Ví dụ:
- "lúa đang trổ thì bón phân gì, bao nhiêu?" → ky_thuat
- "lá lúa có vết hình thoi màu nâu" → trieu_chung
- "giá thuốc trị rầy nâu bao nhiêu?" → san_pham
- "đơn của tôi giao tới đâu rồi?" → don_hang
- "chào shop" → khac

Trả về JSON gồm: intent (1 trong 5 giá trị trên), confidence (0..1 độ chắc chắn), reason (1 câu tiếng Việt ngắn giải thích vì sao chọn nhóm này).`;

// Hướng dẫn Gemini diễn đạt câu trả lời chẩn đoán bệnh (nhánh trieu_chung).
// Chỉ được dùng dữ liệu bệnh trong context (RAG), không bịa thêm.
// LƯU Ý: thuốc gợi ý được FE hiển thị thành thẻ riêng — Gemini KHÔNG liệt kê
// tên/giá thuốc trong văn bản, chỉ dẫn dắt "tham khảo các sản phẩm bên dưới".
const DIAGNOSE_INSTRUCTION = `Bạn là trợ lý nông nghiệp TP Agri, tư vấn về bệnh cây lúa.
Người dùng mô tả triệu chứng. Bạn được cung cấp THÔNG TIN MỘT BỆNH nghi ngờ (lấy từ cơ sở dữ liệu).
Yêu cầu:
- CHỈ dùng thông tin trong context được cung cấp; KHÔNG bịa thêm bệnh hay triệu chứng khác.
- Nếu triệu chứng người dùng rõ ràng KHÔNG khớp với bệnh trong context, hãy nói thật là chưa chắc chắn và khuyên mô tả rõ hơn hoặc liên hệ nhân viên — đừng gượng ép.
- Nếu khớp: trả lời ngắn gọn, thân thiện bằng tiếng Việt: nêu tên bệnh nghi ngờ và mô tả/đặc điểm nhận biết ngắn gọn.
- TUYỆT ĐỐI KHÔNG liệt kê tên thuốc hay giá tiền trong câu trả lời. Nếu context cho biết CÓ thuốc gợi ý, chỉ cần kết bằng câu mời người dùng tham khảo các sản phẩm gợi ý hiển thị bên dưới.
- Văn phong tự nhiên, không dùng JSON, không markdown phức tạp. Tối đa khoảng 4-6 câu.`;

// Hướng dẫn Gemini trả lời câu hỏi kỹ thuật canh tác (nhánh ky_thuat) DỰA TRÊN
// các đoạn tài liệu lấy được qua vector search (RAG). Chỉ dùng dữ liệu trong
// context, không bịa — giống tinh thần DIAGNOSE_INSTRUCTION.
const TECHNIQUE_INSTRUCTION = `Bạn là trợ lý nông nghiệp TP Agri, tư vấn kỹ thuật canh tác cây lúa.
Bạn được cung cấp MỘT SỐ ĐOẠN TRÍCH từ tài liệu kỹ thuật (lấy từ cơ sở dữ liệu).
Yêu cầu:
- CHỈ dùng thông tin trong các đoạn tài liệu được cung cấp; KHÔNG bịa thêm.
- Nếu các đoạn tài liệu KHÔNG chứa thông tin trả lời được câu hỏi, hãy nói thật là chưa có tài liệu về vấn đề này và khuyên người dùng hỏi rõ hơn hoặc liên hệ nhân viên — đừng gượng ép.
- Nếu có: trả lời ngắn gọn, rõ ràng, thân thiện bằng tiếng Việt, tổng hợp lại từ tài liệu (không cần trích nguyên văn).
- Văn phong tự nhiên, không JSON, không markdown phức tạp. Tối đa khoảng 4-6 câu.`;

// Hướng dẫn Gemini viết câu dẫn dắt cho nhánh san_pham. Sản phẩm tìm được sẽ render
// thành thẻ riêng ở FE — Gemini KHÔNG liệt kê tên/giá trong văn bản.
const RECOMMEND_INSTRUCTION = `Bạn là trợ lý bán hàng của TP Agri (cửa hàng vật tư nông nghiệp cho cây lúa).
Người dùng đang hỏi/tìm sản phẩm (thuốc, phân bón). Hệ thống đã tìm được một số sản phẩm phù hợp và sẽ hiển thị thành thẻ bên dưới.
Yêu cầu:
- Viết 1-3 câu tiếng Việt thân thiện mời người dùng tham khảo các sản phẩm gợi ý hiển thị bên dưới.
- TUYỆT ĐỐI KHÔNG liệt kê tên sản phẩm hay giá tiền trong câu trả lời (đã có thẻ riêng).
- Có thể nhắc người dùng bấm vào sản phẩm để xem chi tiết.
- Văn phong tự nhiên, không JSON, không markdown phức tạp.`;

// Hướng dẫn Gemini SO SÁNH các sản phẩm và tư vấn nên chọn cái nào (nhánh so_sanh).
// Khác RECOMMEND_INSTRUCTION: ở đây ĐƯỢC PHÉP nêu tên/giá/thành phần để so sánh có
// ý nghĩa, nhưng CHỈ dùng dữ liệu trong context, không bịa.
const COMPARE_INSTRUCTION = `Bạn là trợ lý tư vấn của TP Agri (vật tư nông nghiệp cho cây lúa).
Người dùng muốn SO SÁNH các sản phẩm dưới đây và muốn biết NÊN CHỌN loại nào.
Bạn được cung cấp THÔNG TIN các sản phẩm (lấy từ cơ sở dữ liệu).
Yêu cầu:
- CHỈ dùng thông tin trong context được cung cấp; KHÔNG bịa thêm thông số, công dụng hay giá.
- So sánh ngắn gọn theo các tiêu chí có dữ liệu: giá, thành phần/hoạt chất, công dụng/hướng dẫn dùng, đánh giá của người mua.
- Đưa ra KHUYẾN NGHỊ nên chọn loại nào TÙY NHU CẦU (vd "nếu ưu tiên giá rẻ → ...", "nếu cần hiệu lực mạnh → ..."). TRÁNH khẳng định tuyệt đối một sản phẩm là "tốt nhất".
- Được phép nhắc tên và giá sản phẩm trong câu trả lời để so sánh rõ ràng.
- Nếu thông tin quá thiếu để so sánh, hãy nói thật và khuyên người dùng xem chi tiết từng sản phẩm hoặc liên hệ nhân viên.
- Văn phong tự nhiên, thân thiện, tiếng Việt. Có thể dùng gạch đầu dòng. Tối đa khoảng 5-8 câu.`;

// Hướng dẫn Gemini viết lại TIN NHẮN MỚI NHẤT thành câu hỏi ĐỘC LẬP (gộp ngữ
// cảnh từ các tin trước) để khâu vector search không bị mù ngữ cảnh. Ví dụ sau
// khi người dùng nói "lúa bị đạo ôn" rồi hỏi "loại nào tốt hơn?" → viết lại thành
// "loại thuốc nào trị bệnh đạo ôn lúa tốt hơn?".
const REWRITE_INSTRUCTION = `Bạn là bộ viết lại câu hỏi cho chatbot nông nghiệp TP Agri (cây lúa).
Nhiệm vụ: dựa vào cuộc hội thoại, viết lại TIN NHẮN MỚI NHẤT của người dùng thành MỘT câu hỏi ĐỘC LẬP, đầy đủ ngữ cảnh, đứng một mình vẫn hiểu được.
Quy tắc:
- Bổ sung chủ thể/đối tượng bị lược (tên bệnh, tên sản phẩm, giai đoạn cây lúa...) lấy từ các tin trước.
- GIỮ NGUYÊN ý định của người dùng, KHÔNG thêm thông tin mới ngoài hội thoại, KHÔNG trả lời câu hỏi.
- Nếu tin mới nhất đã đầy đủ ngữ cảnh, trả lại gần như nguyên văn.
- Viết bằng tiếng Việt, ngắn gọn, chỉ trả về ĐÚNG MỘT câu hỏi đã viết lại, không thêm giải thích.`;

// Bỏ dấu tiếng Việt + viết thường để luật từ khóa bắt được cả câu không dấu.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // bỏ dấu thanh/dấu mũ
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

// Luật từ khóa, xét theo THỨ TỰ trong mảng (trên xuống) — luật đầu khớp sẽ thắng.
// Thứ tự được sắp để xử lý câu "chồng nhóm": ví dụ "lá đốm nâu, có thuốc nào trị"
// vừa là triệu chứng vừa hỏi sản phẩm → san_pham đứng trước nên thắng (đúng ý định mua).
// Từ khóa đã ở dạng đã normalize (không dấu, viết thường).
const KEYWORD_RULES: { intent: Intent; keywords: string[] }[] = [
  // don_hang: rất đặc trưng, hiếm khi nhầm → ưu tiên cao nhất.
  {
    intent: 'don_hang',
    keywords: [
      'don hang',
      'don cua toi',
      'giao toi dau',
      'giao den dau',
      'da mua',
      'lich su mua',
      'gio hang',
      'tra cuu don',
      'theo doi don',
      'ma don',
    ],
  },
  // so_sanh: so sánh / chọn lựa giữa các SP đã gợi ý. ĐỨNG TRƯỚC san_pham vì câu
  // "loại nào tốt hơn" vừa nhắc SP vừa mang ý chọn → ưu tiên so_sanh.
  {
    intent: 'so_sanh',
    keywords: [
      'so sanh',
      'loai nao tot hon',
      'cai nao tot hon',
      'loai nao tot',
      'cai nao tot',
      'nen chon',
      'nen mua cai nao',
      'nen mua loai nao',
      'chon cai nao',
      'chon loai nao',
      'khac nhau',
    ],
  },
  // san_pham: có ý định mua / hỏi giá → thắng triệu chứng nếu cùng xuất hiện.
  // Chỉ dùng cụm RÕ RÀNG; tránh từ quá rộng ('gia ', 'mua ') vì khớp nhầm
  // "giá rét", "đánh giá", "mùa mưa"... → câu mơ hồ để Gemini phân loại.
  {
    intent: 'san_pham',
    keywords: [
      'gia bao nhieu',
      'bao nhieu tien',
      'bao nhieu mot',
      'gia cua',
      'co thuoc',
      'thuoc nao',
      'loai thuoc',
      'co loai nao',
      'san pham',
      'con hang',
      'dat mua',
      'muon mua',
      'can mua',
      'tu van phan bon',
      'thuoc tri sau benh',
    ],
  },
  // trieu_chung: chỉ bắt cụm rõ ràng (vd nút "Chẩn đoán bệnh lúa"); mô tả triệu
  // chứng tự do để Gemini lo vì diễn đạt quá đa dạng, dễ bắt nhầm.
  {
    intent: 'trieu_chung',
    keywords: [
      'chan doan benh',
      'cay lua bi benh gi',
      'la lua bi benh gi',
      'lua bi benh gi',
      'la benh gi',
    ],
  },
  // ky_thuat: hỏi cách làm / quy trình canh tác. Bắt các cụm rõ ràng để khỏi
  // tốn request Gemini cho câu kỹ thuật phổ biến.
  {
    intent: 'ky_thuat',
    keywords: [
      'ky thuat',
      'cach lam dat',
      'lam dat',
      'gieo sa',
      'ngam u giong',
      'chon giong',
      'cach bon phan',
      'bon phan cho lua',
      'quan ly nuoc',
      'tuoi nuoc',
      'lam co',
      'thu hoach',
      'bao quan lua',
      'mua vu',
      'cach trong lua',
      'cham soc lua',
    ],
  },
  // khac: chào hỏi / cảm ơn / liên hệ.
  {
    intent: 'khac',
    keywords: [
      'xin chao',
      'chao shop',
      'chao ban',
      'hello',
      'cam on',
      'tam biet',
      'lien he nhan vien',
      'gap nhan vien',
    ],
  },
];

// Thẻ sản phẩm thuốc gợi ý đính kèm câu trả lời chẩn đoán (nhánh trieu_chung).
export interface ChatProduct {
  id: string;
  name: string;
  price: number; // giá bán thực tế (salePrice nếu có, ngược lại price)
  originalPrice: number | null; // giá gốc nếu đang giảm giá (để gạch ngang); null = không giảm
  image: string | null;
  rating: number; // điểm trung bình 0..5
  reviewCount: number; // số lượt đánh giá
}

// Mức độ tin cậy chẩn đoán để FE đổi màu/nhãn.
export type DiagnosisLevel = 'cao' | 'trung_binh' | 'thap';

// Kết quả chẩn đoán bệnh để FE render thành "thẻ chẩn đoán".
export interface Diagnosis {
  disease: string; // tên bệnh
  confidence: number; // 0..100 (đã ánh xạ từ cosine score sang % trực quan)
  level: DiagnosisLevel;
}

export interface ChatResult {
  intent: Intent;
  confidence: number;
  reason: string;
  reply: string;
  source: 'rule' | 'gemini' | 'fallback';
  // Chỉ có ở nhánh trieu_chung khi tìm được bệnh + có thuốc gợi ý.
  products?: ChatProduct[];
  // Chỉ có ở nhánh trieu_chung khi vector search tìm được bệnh trên ngưỡng.
  diagnosis?: Diagnosis;
  // Chỉ có ở nhánh ky_thuat: tên các tài liệu nguồn câu trả lời được lấy ra
  // (để FE hiển thị "Nguồn: ...", giúp người dùng biết đây là dữ liệu thật, không bịa).
  sources?: string[];
}

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly ai: GoogleGenAI | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly embeddingService: EmbeddingService,
    private readonly techniquesService: TechniquesService,
    private readonly diseasePredictionService: DiseasePredictionService,
    @InjectRepository(Disease)
    private readonly diseasesRepository: MongoRepository<Disease>,
    @InjectRepository(Product)
    private readonly productsRepository: MongoRepository<Product>,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
    if (!this.ai) {
      this.logger.warn(
        'Thiếu GEMINI_API_KEY trong .env — chatbot sẽ không hoạt động',
      );
    }
  }

  /**
   * Phân loại intent rồi trả về thông báo debug cho biết đã vào nhánh nào.
   * Bước này CHƯA xử lý nhánh thật — chỉ để test khả năng phân loại đầu vào.
   */
  async chat(
    messages: ChatMessageDto[],
    comparedProductIds?: string[],
  ): Promise<ChatResult> {
    if (!this.ai) {
      throw new ServiceUnavailableException(
        'Chatbot chưa được cấu hình (thiếu GEMINI_API_KEY)',
      );
    }

    // Lấy tin nhắn mới nhất của người dùng để thử luật từ khóa trước.
    const lastUser = [...messages]
      .reverse()
      .find((m) => m.role === 'user')?.content;

    // Câu dùng cho khâu truy hồi (vector search). Mặc định là tin cuối, nhưng nếu
    // hội thoại có ngữ cảnh trước đó thì viết lại thành câu ĐỘC LẬP (gộp ngữ cảnh)
    // để embedding không bị mù ngữ cảnh với câu nối tiếp ("loại nào tốt hơn?").
    const retrievalText = await this.buildRetrievalText(messages, lastUser);

    // Lớp 1: luật từ khóa — câu rõ ràng được gán intent ngay, không tốn request Gemini.
    const ruleIntent = lastUser ? this.ruleClassify(lastUser) : null;
    if (ruleIntent) {
      const branch = await this.runIntentBranch(
        ruleIntent,
        retrievalText,
        comparedProductIds,
      );
      return {
        // 0.9 (không phải 1): luật từ khóa nhanh nhưng không hoàn hảo bằng Gemini,
        // tránh báo "chắc chắn tuyệt đối" cho trường hợp keyword khớp nhầm.
        intent: ruleIntent,
        confidence: 0.9,
        reason: 'Khớp luật từ khóa',
        reply: branch.reply ?? INTENT_LABEL[ruleIntent],
        source: 'rule',
        ...(branch.products?.length ? { products: branch.products } : {}),
        ...(branch.diagnosis ? { diagnosis: branch.diagnosis } : {}),
        ...(branch.sources?.length ? { sources: branch.sources } : {}),
      };
    }

    // Lớp 2: câu mơ hồ / không khớp luật → để Gemini phân loại.
    const { intent, confidence, reason, source } =
      await this.classifyIntent(messages);

    const branch = await this.runIntentBranch(
      intent,
      retrievalText,
      comparedProductIds,
    );
    return {
      intent,
      confidence,
      reason,
      reply: branch.reply ?? INTENT_LABEL[intent],
      source,
      ...(branch.products?.length ? { products: branch.products } : {}),
      ...(branch.diagnosis ? { diagnosis: branch.diagnosis } : {}),
      ...(branch.sources?.length ? { sources: branch.sources } : {}),
    };
  }

  /**
   * Dự đoán bệnh từ ẢNH người dùng gửi trong chatbot.
   * Khác nhánh trieu_chung (mô tả bằng chữ → vector search): nhánh này forward ảnh
   * sang ml-service (model AI) qua DiseasePredictionService, KHÔNG gọi Gemini diễn
   * đạt — reply lấy thẳng từ dữ liệu bệnh trong DB.
   *
   * Trả về cùng shape ChatResult với nhánh text để FE render chung
   * (thẻ chẩn đoán + thẻ thuốc gợi ý).
   */
  async predictImage(file: Express.Multer.File): Promise<ChatResult> {
    // predict() forward ảnh sang ml-service rồi map slug → Disease (kèm thuốc).
    const result = await this.diseasePredictionService.predict(file);
    const top = result.top;

    // Model luôn trả top-1 kể cả ảnh không phải lá lúa → dưới ngưỡng (hoặc DB chưa
    // có bệnh tương ứng) thì trả lời an toàn, không khẳng định bệnh.
    if (!top || !top.disease || top.confidence < IMAGE_CONF_MIN) {
      return {
        intent: 'trieu_chung',
        confidence: top?.confidence ?? 0,
        reason: 'Ảnh không đủ tin cậy để chẩn đoán',
        reply:
          'Mình chưa nhận diện chắc chắn bệnh từ ảnh này. Bạn thử chụp rõ hơn vết ' +
          'bệnh trên lá/thân lúa (đủ sáng, cận cảnh), hoặc bấm "Liên hệ nhân viên" ' +
          'để được hỗ trợ trực tiếp nhé.',
        source: 'rule',
      };
    }

    const disease = top.disease;

    // Thẻ chẩn đoán dùng confidence THẬT của model (0..1) → %, khác buildDiagnosis
    // (map từ cosine score của vector search ở nhánh text).
    const diagnosis = this.buildDiagnosisFromConfidence(
      disease.name,
      top.confidence,
    );

    // Thuốc gợi ý — tái dùng helper của nhánh text.
    const products = await this.loadRecommendedProducts(
      disease.recommendedProductIds ?? [],
    );

    // Reply lấy thẳng từ DB (không Gemini). Thuốc render thành thẻ riêng ở FE nên
    // không liệt kê tên/giá trong text.
    const intro = `Theo ảnh bạn gửi, nhiều khả năng cây lúa bị **${disease.name}**.`;
    const desc = disease.description ? `\n${disease.description}` : '';
    const meds = products.length
      ? '\n\nBạn tham khảo các sản phẩm gợi ý bên dưới nhé.'
      : '';

    return {
      intent: 'trieu_chung',
      confidence: top.confidence,
      reason: 'Chẩn đoán từ ảnh',
      reply: `${intro}${desc}${meds}`,
      source: 'rule',
      diagnosis,
      products: this.toProductCards(products),
    };
  }

  /**
   * Ánh xạ confidence (0..1) của model ảnh sang thẻ chẩn đoán cho FE.
   * Khác buildDiagnosis (nhận cosine score): ở đây confidence đã là xác suất nên
   * dùng trực tiếp → %, và phân mức theo các mốc 0.8 / 0.6.
   */
  private buildDiagnosisFromConfidence(
    disease: string,
    confidence: number,
  ): Diagnosis {
    const pct = Math.round(Math.min(1, Math.max(0, confidence)) * 100);

    let level: DiagnosisLevel;
    if (confidence >= 0.8) level = 'cao';
    else if (confidence >= 0.6) level = 'trung_binh';
    else level = 'thap';

    return { disease, confidence: pct, level };
  }

  /**
   * Tạo câu dùng cho khâu truy hồi (vector search). Nếu hội thoại chỉ có một tin
   * người dùng (không có ngữ cảnh trước) thì dùng nguyên tin cuối — khỏi tốn
   * request Gemini. Nếu có ngữ cảnh trước đó, nhờ Gemini viết lại thành câu độc
   * lập để embedding không mất ngữ cảnh với câu nối tiếp ("loại nào tốt hơn?").
   */
  private async buildRetrievalText(
    messages: ChatMessageDto[],
    lastUser: string | undefined,
  ): Promise<string | undefined> {
    if (!lastUser) return undefined;

    // Chỉ viết lại khi có ít nhất một tin TRƯỚC tin cuối làm ngữ cảnh.
    const hasPriorContext = messages.length > 1;
    if (!hasPriorContext) return lastUser;

    return this.rewriteStandaloneQuery(messages, lastUser);
  }

  /**
   * Gemini viết lại tin nhắn mới nhất thành câu hỏi độc lập (gộp ngữ cảnh hội
   * thoại). Trả về câu gốc nếu Gemini lỗi/rỗng để không chặn luồng truy hồi.
   */
  private async rewriteStandaloneQuery(
    messages: ChatMessageDto[],
    lastUser: string,
  ): Promise<string> {
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    try {
      const response = await this.ai!.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: REWRITE_INSTRUCTION,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const rewritten = (response.text ?? '').trim();
      // Phòng Gemini trả rỗng hoặc lỡ trả nguyên cả đoạn dài bất thường → giữ câu gốc.
      if (rewritten && rewritten.length <= 4000) return rewritten;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Viết lại câu hỏi độc lập thất bại: ${msg}`);
    }

    return lastUser;
  }

  /**
   * Thực thi nhánh xử lý theo intent. Trả về phần dữ liệu để ghép vào ChatResult.
   * Nhánh chưa triển khai (ky_thuat, don_hang, khac) trả {} → dùng INTENT_LABEL.
   */
  private async runIntentBranch(
    intent: Intent,
    retrievalText: string | undefined,
    comparedProductIds?: string[],
  ): Promise<{
    reply?: string;
    products?: ChatProduct[];
    diagnosis?: Diagnosis;
    sources?: string[];
  }> {
    // Nhánh khac (chào hỏi / ngoài phạm vi) không cần truy hồi → câu trả lời cố định.
    if (intent === 'khac') {
      return { reply: this.khacReply() };
    }
    // Nhánh so_sanh: ưu tiên SP do FE gửi kèm (comparedProductIds); nếu rỗng thì
    // fallback tìm theo câu hỏi. Xử lý trước check retrievalText vì dựa vào ids.
    if (intent === 'so_sanh') {
      const res = await this.handleSoSanh(retrievalText, comparedProductIds);
      return { reply: res.reply, products: res.products };
    }
    if (!retrievalText) return {};
    if (intent === 'trieu_chung') {
      const diag = await this.handleTrieuChung(retrievalText);
      return {
        reply: diag.reply,
        products: diag.products,
        diagnosis: diag.diagnosis,
      };
    }
    if (intent === 'san_pham') {
      const res = await this.handleSanPham(retrievalText);
      return { reply: res.reply, products: res.products };
    }
    if (intent === 'ky_thuat') {
      const res = await this.handleKyThuat(retrievalText);
      return { reply: res.reply, sources: res.sources };
    }
    return {};
  }

  /**
   * Câu trả lời cố định cho nhánh khac: vừa đáp lại chào hỏi/cảm ơn, vừa nhắc lại
   * phạm vi hỗ trợ để hướng người dùng về đúng chủ đề cây lúa (không gọi Gemini).
   */
  private khacReply(): string {
    return (
      'Mình là trợ lý ảo của TP Agri 🌾, chuyên hỗ trợ về cây lúa. Mình có thể giúp bạn:\n' +
      '• Chẩn đoán bệnh lúa (mô tả triệu chứng hoặc gửi ảnh lá lúa)\n' +
      '• Tư vấn thuốc & phân bón phù hợp\n' +
      '• Giải đáp kỹ thuật canh tác lúa\n' +
      'Bạn cứ đặt câu hỏi, hoặc bấm "Liên hệ nhân viên" nếu cần hỗ trợ trực tiếp nhé!'
    );
  }

  /* ─────────────────────────────────────────
     Nhánh ky_thuat — RAG kỹ thuật canh tác lúa
     Retrieval: Atlas Vector Search trên technique_chunks (đoạn tài liệu admin upload).
     Generation: Gemini tổng hợp câu trả lời CHỈ từ các đoạn tìm được, không bịa.
  ───────────────────────────────────────── */

  /**
   * Trả lời câu hỏi kỹ thuật canh tác từ tài liệu đã nạp.
   * 1) Embedding câu hỏi → 2) vector search top-N đoạn tài liệu → 3) Gemini tổng
   * hợp câu trả lời (hoặc nói chưa có tài liệu nếu không tìm được đoạn liên quan).
   */
  private async handleKyThuat(
    userText: string,
  ): Promise<{ reply: string; sources?: string[] }> {
    // Không có embedding (chưa cấu hình key) → không truy hồi được tài liệu.
    if (!this.embeddingService.enabled) {
      return { reply: this.kyThuatFallbackReply() };
    }

    let queryVector: number[];
    try {
      queryVector = await this.embeddingService.embedQuery(userText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Embedding câu hỏi kỹ thuật thất bại: ${msg}`);
      return { reply: this.kyThuatFallbackReply() };
    }
    if (queryVector.length !== EMBEDDING_DIM) {
      return { reply: this.kyThuatFallbackReply() };
    }

    const chunks = await this.techniquesService.searchRelevant(
      queryVector,
      TECHNIQUE_LIMIT,
      TECHNIQUE_MIN_SCORE,
    );

    // Không tìm được đoạn tài liệu nào đủ liên quan → trả lời an toàn, không bịa.
    if (chunks.length === 0) {
      return { reply: this.kyThuatFallbackReply() };
    }

    const reply = await this.composeTechniqueReply(userText, chunks);

    // Tên tài liệu nguồn (distinct) để FE hiển thị "Nguồn: ..." — cho người dùng
    // thấy câu trả lời lấy từ tài liệu thật, không phải AI bịa.
    const sources = [...new Set(chunks.map((c) => c.docTitle))];
    return { reply, sources };
  }

  /** Câu trả lời an toàn khi nhánh ky_thuat không có/không tìm được tài liệu. */
  private kyThuatFallbackReply(): string {
    return (
      'Hiện mình chưa có tài liệu phù hợp để trả lời câu hỏi kỹ thuật này. ' +
      'Bạn thử hỏi cụ thể hơn (giai đoạn sinh trưởng, loại đất, mùa vụ...) ' +
      'hoặc bấm "Liên hệ nhân viên" để được hỗ trợ trực tiếp nhé.'
    );
  }

  /**
   * Gemini tổng hợp câu trả lời kỹ thuật từ các đoạn tài liệu tìm được (RAG).
   * Context = nội dung các chunk; mô hình chỉ được dùng dữ liệu này, không bịa.
   */
  private async composeTechniqueReply(
    userText: string,
    chunks: { content: string; docTitle: string; score: number }[],
  ): Promise<string> {
    const context = chunks
      .map((c, i) => `[Đoạn ${i + 1} — nguồn: ${c.docTitle}]\n${c.content}`)
      .join('\n\n');

    try {
      const response = await this.ai!.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Người dùng hỏi: "${userText}"\n\nCÁC ĐOẠN TÀI LIỆU (chỉ dùng dữ liệu này):\n${context}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: TECHNIQUE_INSTRUCTION,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const reply = (response.text ?? '').trim();
      if (reply) return reply;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Diễn đạt câu trả lời kỹ thuật thất bại: ${msg}`);
    }

    // Fallback nếu Gemini lỗi/rỗng: trả nguyên đoạn tài liệu khớp nhất.
    return `Theo tài liệu kỹ thuật, bạn tham khảo thông tin sau nhé:\n\n${chunks[0].content}`;
  }

  /* ─────────────────────────────────────────
     Nhánh trieu_chung — RAG chẩn đoán bệnh lúa
     Retrieval: Atlas Vector Search lấy bệnh gần nghĩa nhất.
     Generation: Gemini diễn đạt câu tư vấn + đính kèm thuốc gợi ý.
  ───────────────────────────────────────── */

  /**
   * Chẩn đoán bệnh từ mô tả triệu chứng của người dùng.
   * 1) Embedding câu hỏi → 2) vector search top-1 bệnh → 3) lấy thuốc gợi ý
   * → 4) Gemini diễn đạt câu trả lời tự nhiên (hoặc từ chối nếu không khớp).
   */
  private async handleTrieuChung(userText: string): Promise<{
    reply: string;
    products: ChatProduct[];
    diagnosis?: Diagnosis;
  }> {
    // B1: tìm bệnh gần nghĩa nhất qua Atlas Vector Search.
    const match = await this.findBestDisease(userText);

    // Không có bệnh nào đủ giống (hoặc embedding chưa sẵn sàng) → trả lời an toàn.
    if (!match) {
      return {
        reply:
          'Mình chưa nhận ra chính xác bệnh từ mô tả này. Bạn thử mô tả rõ hơn về ' +
          'vị trí và màu sắc vết bệnh trên lá/thân lúa, hoặc bấm "Liên hệ nhân viên" ' +
          'để được hỗ trợ trực tiếp nhé.',
        products: [],
      };
    }

    // Ánh xạ điểm cosine sang thẻ chẩn đoán (tên bệnh + % + mức độ) cho FE.
    const diagnosis = this.buildDiagnosis(match.disease.name, match.score);

    // B2: lấy danh sách thuốc gợi ý (đang còn active) theo recommendedProductIds.
    const products = await this.loadRecommendedProducts(
      match.disease.recommendedProductIds ?? [],
    );

    // B3: Gemini diễn đạt phần chẩn đoán (thuốc tách ra thẻ riêng, không nhét vào text).
    const reply = await this.composeDiagnosisReply(
      userText,
      match.disease,
      products,
    );

    return { reply, products: this.toProductCards(products), diagnosis };
  }

  /** Map Product (DB) → ChatProduct (thẻ gọn cho FE). Dùng chung cho mọi nhánh. */
  private toProductCards(products: Product[]): ChatProduct[] {
    return products.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      price: p.salePrice ?? p.price,
      // Có salePrice nghĩa là đang giảm → giá gốc là p.price (để FE gạch ngang).
      originalPrice: p.salePrice != null ? p.price : null,
      image: p.images?.[0]?.url ?? null,
      rating: p.averageRating ?? 0,
      reviewCount: p.reviewCount ?? 0,
    }));
  }

  /**
   * Ánh xạ điểm cosine của vector search sang thẻ chẩn đoán cho FE:
   * - confidence: % trực quan (map [0.82..0.95] → [60..99]).
   * - level: nhãn mức độ để FE đổi màu (cao / trung bình / thấp).
   */
  private buildDiagnosis(disease: string, score: number): Diagnosis {
    const ratio = (score - SCORE_CONF_MIN) / (SCORE_CONF_MAX - SCORE_CONF_MIN);
    const clamped = Math.min(1, Math.max(0, ratio));
    const confidence = Math.round(60 + clamped * 39); // 60..99

    let level: DiagnosisLevel;
    if (score >= 0.88) level = 'cao';
    else if (score >= 0.84) level = 'trung_binh';
    else level = 'thap';

    return { disease, confidence, level };
  }

  /**
   * Atlas Vector Search: embed câu hỏi rồi tìm bệnh có embedding gần nhất.
   * Trả về null nếu: chưa cấu hình embedding, lỗi truy vấn, hoặc score < ngưỡng.
   */
  private async findBestDisease(
    userText: string,
  ): Promise<{ disease: Disease; score: number } | null> {
    if (!this.embeddingService.enabled) return null;

    let queryVector: number[];
    try {
      queryVector = await this.embeddingService.embedQuery(userText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Embedding câu hỏi thất bại: ${msg}`);
      return null;
    }
    if (queryVector.length !== EMBEDDING_DIM) return null;

    try {
      const results = (await this.diseasesRepository
        .aggregate([
          {
            $vectorSearch: {
              index: DISEASE_VECTOR_INDEX,
              path: 'embedding',
              queryVector,
              numCandidates: 100,
              limit: 1,
            },
          },
          {
            // Lọc chỉ bệnh đang active + lấy điểm tương đồng để so ngưỡng.
            $project: {
              name: 1,
              slug: 1,
              symptoms: 1,
              description: 1,
              recommendedProductIds: 1,
              images: 1,
              isActive: 1,
              score: { $meta: 'vectorSearchScore' },
            },
          },
        ])
        .toArray()) as Array<Disease & { score: number }>;

      const top = results[0];
      if (!top || top.isActive === false) return null;
      if (top.score < VECTOR_MIN_SCORE) return null;

      return { disease: top, score: top.score };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Lỗi thường gặp: chưa tạo Vector Search Index trên Atlas → báo log rõ.
      this.logger.error(
        `Vector search thất bại (đã tạo index "${DISEASE_VECTOR_INDEX}" trên Atlas chưa?): ${msg}`,
      );
      return null;
    }
  }

  /** Lấy thông tin các sản phẩm thuốc gợi ý (chỉ lấy bản đang active). */
  private async loadRecommendedProducts(ids: string[]): Promise<Product[]> {
    const objectIds = ids
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    if (objectIds.length === 0) return [];

    try {
      return await this.productsRepository.find({
        where: { _id: { $in: objectIds }, isActive: true } as any,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Tải thuốc gợi ý thất bại: ${msg}`);
      return [];
    }
  }

  /**
   * Gemini diễn đạt câu trả lời chẩn đoán. Context = bệnh + thuốc lấy từ DB; mô
   * hình chỉ được dùng dữ liệu này, không bịa thêm bệnh/thuốc khác.
   */
  private async composeDiagnosisReply(
    userText: string,
    disease: Disease,
    products: Product[],
  ): Promise<string> {
    // Chỉ báo CÓ/KHÔNG thuốc gợi ý để Gemini dẫn dắt câu — không đưa tên/giá vào
    // text (thuốc render thành thẻ riêng ở FE).
    const medsHint = products.length
      ? `Có ${products.length} sản phẩm thuốc gợi ý sẽ hiển thị bên dưới (đừng liệt kê tên/giá trong câu trả lời).`
      : 'Hiện chưa có thuốc gợi ý trong hệ thống (đừng nhắc đến thuốc).';

    const context = `BỆNH NGHI NGỜ (lấy từ cơ sở dữ liệu, chỉ dùng dữ liệu này):
Tên bệnh: ${disease.name}
Triệu chứng: ${(disease.symptoms ?? []).join('; ') || '(không có)'}
Mô tả: ${disease.description || '(không có)'}
${medsHint}`;

    try {
      const response = await this.ai!.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Người dùng mô tả: "${userText}"\n\n${context}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: DIAGNOSE_INSTRUCTION,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const reply = (response.text ?? '').trim();
      if (reply) return reply;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Diễn đạt chẩn đoán thất bại: ${msg}`);
    }

    // Fallback nếu Gemini lỗi/rỗng: ghép câu trả lời cơ bản từ dữ liệu DB.
    // Không liệt kê thuốc trong text — thuốc đã ở thẻ riêng do FE render.
    const intro = `Theo mô tả của bạn, nhiều khả năng cây lúa bị **${disease.name}**.`;
    const desc = disease.description ? `\n${disease.description}` : '';
    const meds = products.length
      ? '\n\nBạn tham khảo các sản phẩm gợi ý bên dưới nhé.'
      : '';
    return `${intro}${desc}${meds}`;
  }

  /* ─────────────────────────────────────────
     Nhánh san_pham — tìm sản phẩm theo ngữ nghĩa
     Retrieval: Atlas Vector Search trên products.embedding (embedding SP chứa cả
     name + công dụng + tên bệnh trị, nên khớp được cả câu hỏi theo tên bệnh).
     Generation: Gemini viết câu dẫn dắt + đính kèm thẻ sản phẩm.
  ───────────────────────────────────────── */

  /**
   * Tìm sản phẩm phù hợp với câu hỏi mua hàng.
   * 1) Embedding câu hỏi → 2) vector search top-N sản phẩm → 3) Gemini viết câu
   * dẫn dắt. Không trả diagnosis (người dùng đang hỏi mua, không nhờ chẩn đoán).
   */
  private async handleSanPham(
    userText: string,
  ): Promise<{ reply: string; products: ChatProduct[] }> {
    const products = await this.findBestProducts(userText, PRODUCT_LIMIT);

    if (products.length === 0) {
      return {
        reply:
          'Mình chưa tìm thấy sản phẩm phù hợp với yêu cầu này. Bạn thử nói rõ hơn ' +
          'tên loại thuốc/phân bón hoặc bệnh cần trị, hoặc bấm "Liên hệ nhân viên" ' +
          'để được tư vấn trực tiếp nhé.',
        products: [],
      };
    }

    const reply = await this.composeRecommendReply(userText, products);
    return { reply, products: this.toProductCards(products) };
  }

  /**
   * Atlas Vector Search trên products: embed câu hỏi rồi tìm các SP gần nghĩa nhất
   * (đang active, trên ngưỡng). Trả [] nếu chưa cấu hình embedding hoặc lỗi.
   */
  private async findBestProducts(
    userText: string,
    limit: number,
  ): Promise<Product[]> {
    if (!this.embeddingService.enabled) return [];

    let queryVector: number[];
    try {
      queryVector = await this.embeddingService.embedQuery(userText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Embedding câu hỏi SP thất bại: ${msg}`);
      return [];
    }
    if (queryVector.length !== EMBEDDING_DIM) return [];

    try {
      const results = (await this.productsRepository
        .aggregate([
          {
            $vectorSearch: {
              index: PRODUCT_VECTOR_INDEX,
              path: 'embedding',
              queryVector,
              numCandidates: 100,
              limit,
            },
          },
          {
            $project: {
              name: 1,
              price: 1,
              salePrice: 1,
              images: 1,
              averageRating: 1,
              reviewCount: 1,
              isActive: 1,
              score: { $meta: 'vectorSearchScore' },
            },
          },
        ])
        .toArray()) as Array<Product & { score: number }>;

      // Lọc 1: chỉ SP đang active và trên ngưỡng sàn (loại câu lạc đề).
      const candidates = results.filter(
        (p) => p.isActive !== false && p.score >= PRODUCT_MIN_SCORE,
      );
      if (candidates.length === 0) return [];

      // Lọc 2: loại SP nhiễu rớt xa SP khớp nhất (results đã sắp theo score giảm dần).
      const topScore = candidates[0].score;
      return candidates.filter((p) => p.score >= topScore - PRODUCT_SCORE_GAP);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Vector search SP thất bại (đã tạo index "${PRODUCT_VECTOR_INDEX}" trên Atlas chưa?): ${msg}`,
      );
      return [];
    }
  }

  /**
   * Gemini viết câu dẫn dắt cho danh sách SP tìm được. Không liệt kê tên/giá (đã
   * render thành thẻ). Fallback câu cố định nếu Gemini lỗi/rỗng.
   */
  private async composeRecommendReply(
    userText: string,
    products: Product[],
  ): Promise<string> {
    try {
      const response = await this.ai!.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Người dùng hỏi: "${userText}"\n\nĐã tìm được ${products.length} sản phẩm phù hợp (hiển thị thành thẻ bên dưới).`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: RECOMMEND_INSTRUCTION,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const reply = (response.text ?? '').trim();
      if (reply) return reply;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Diễn đạt gợi ý SP thất bại: ${msg}`);
    }

    return 'Mình tìm được một vài sản phẩm phù hợp, bạn tham khảo các gợi ý bên dưới nhé. Bấm vào sản phẩm để xem chi tiết.';
  }

  /* ─────────────────────────────────────────
     Nhánh so_sanh — so sánh & tư vấn chọn sản phẩm
     Nguồn SP: comparedProductIds do FE gửi kèm (các SP đang hiển thị). Nếu rỗng →
     fallback vector search theo câu hỏi. Generation: Gemini viết đoạn so sánh +
     khuyến nghị (được phép nêu tên/giá để so sánh có ý nghĩa).
  ───────────────────────────────────────── */

  /**
   * So sánh các sản phẩm và tư vấn nên chọn loại nào.
   * 1) Lấy SP cần so sánh (ưu tiên ids FE gửi, fallback vector search) →
   * 2) Gemini viết đoạn so sánh từ dữ liệu SP → 3) trả kèm thẻ SP để bấm xem chi tiết.
   */
  private async handleSoSanh(
    userText: string | undefined,
    comparedProductIds?: string[],
  ): Promise<{ reply: string; products: ChatProduct[] }> {
    // Ưu tiên SP do FE gửi (đúng các SP người dùng đang nhìn). Nếu không có thì
    // thử tìm theo câu hỏi để vẫn so sánh được khi thiếu context.
    let products = await this.loadRecommendedProducts(comparedProductIds ?? []);
    if (products.length < 2 && userText) {
      products = await this.findBestProducts(userText, PRODUCT_LIMIT);
    }

    // Cần ít nhất 2 SP mới so sánh được.
    if (products.length < 2) {
      return {
        reply:
          'Mình cần ít nhất 2 sản phẩm để so sánh giúp bạn. Bạn thử hỏi tư vấn sản ' +
          'phẩm trước (vd "thuốc trị đạo ôn"), rồi nhờ mình so sánh các loại gợi ý nhé.',
        products: this.toProductCards(products),
      };
    }

    const reply = await this.composeCompareReply(userText ?? '', products);
    return { reply, products: this.toProductCards(products) };
  }

  /**
   * Gemini viết đoạn so sánh + khuyến nghị từ thông tin các SP. Khác
   * composeRecommendReply: ĐƯỢC PHÉP nêu tên/giá/thành phần để so sánh.
   * Context chỉ gồm dữ liệu SP từ DB; fallback câu cố định nếu Gemini lỗi/rỗng.
   */
  private async composeCompareReply(
    userText: string,
    products: Product[],
  ): Promise<string> {
    // Liệt kê từng SP với các tiêu chí có dữ liệu để Gemini so sánh.
    const context = products
      .map((p, i) => {
        const price = p.salePrice ?? p.price;
        const lines = [
          `${i + 1}. ${p.name}`,
          `   - Giá: ${price.toLocaleString('vi-VN')}đ${
            p.salePrice != null ? ` (giảm từ ${p.price.toLocaleString('vi-VN')}đ)` : ''
          }`,
        ];
        if (p.ingredients) lines.push(`   - Thành phần/hoạt chất: ${p.ingredients}`);
        if (p.usageInstructions)
          lines.push(`   - Hướng dẫn dùng: ${p.usageInstructions}`);
        if (p.description) lines.push(`   - Mô tả: ${p.description}`);
        if (p.reviewCount > 0)
          lines.push(
            `   - Đánh giá: ${p.averageRating.toFixed(1)}/5 (${p.reviewCount} lượt)`,
          );
        else lines.push('   - Đánh giá: chưa có');
        return lines.join('\n');
      })
      .join('\n\n');

    try {
      const response = await this.ai!.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Người dùng hỏi: "${userText}"\n\nCÁC SẢN PHẨM CẦN SO SÁNH (chỉ dùng dữ liệu này):\n${context}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: COMPARE_INSTRUCTION,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const reply = (response.text ?? '').trim();
      if (reply) return reply;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Diễn đạt so sánh SP thất bại: ${msg}`);
    }

    return 'Mình đã liệt kê các sản phẩm để bạn so sánh bên dưới. Bạn bấm vào từng sản phẩm để xem chi tiết, hoặc cho mình biết bạn ưu tiên tiêu chí nào (giá, hiệu lực, đánh giá) để mình tư vấn rõ hơn nhé.';
  }

  /**
   * Phân loại nhanh bằng luật từ khóa. Trả về intent nếu khớp, null nếu không
   * (để rơi xuống Gemini). Xét KEYWORD_RULES theo thứ tự ưu tiên đã định.
   */
  private ruleClassify(text: string): Intent | null {
    const norm = normalize(text);
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((kw) => norm.includes(kw))) {
        return rule.intent;
      }
    }
    return null;
  }

  /** Gọi Gemini phân loại tin nhắn mới nhất vào 1 trong 5 nhóm intent (JSON ép kiểu). */
  private async classifyIntent(messages: ChatMessageDto[]): Promise<{
    intent: Intent;
    confidence: number;
    reason: string;
    source: 'gemini' | 'fallback';
  }> {
    const fallback = {
      intent: 'khac' as Intent,
      confidence: 0,
      reason: 'không phân loại được',
      source: 'fallback' as const,
    };

    // Map messages của frontend → contents của Gemini ("assistant" → "model").
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    try {
      const response = await this.ai!.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: CLASSIFY_INSTRUCTION,
          // Tắt thinking: phân loại là tác vụ đơn giản, cần JSON sạch + nhanh + ổn định.
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: { type: Type.STRING, enum: [...INTENTS] },
              confidence: { type: Type.NUMBER },
              reason: { type: Type.STRING },
            },
            required: ['intent', 'confidence', 'reason'],
          },
        },
      });

      const raw = (response.text ?? '').trim();
      if (!raw) return fallback;

      const parsed = JSON.parse(raw) as {
        intent?: string;
        confidence?: number;
        reason?: string;
      };

      // Phòng trường hợp Gemini trả intent ngoài danh sách.
      if (!parsed.intent || !INTENTS.includes(parsed.intent as Intent)) {
        return fallback;
      }

      return {
        intent: parsed.intent as Intent,
        confidence:
          typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        reason: parsed.reason ?? '',
        source: 'gemini',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Phân loại intent thất bại: ${msg}`);
      // Lỗi gọi API (vd hết quota 429, mất mạng) → báo rõ để không nhầm là phân
      // loại sai. Riêng lỗi parse JSON thì coi như "khac" để không vỡ luồng test.
      if (err instanceof SyntaxError) {
        return fallback;
      }
      throw new ServiceUnavailableException(
        'Không gọi được Gemini để phân loại (có thể hết quota API). Vui lòng thử lại sau.',
      );
    }
  }
}
